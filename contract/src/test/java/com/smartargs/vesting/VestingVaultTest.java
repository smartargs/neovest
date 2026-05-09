package com.smartargs.vesting;

import io.neow3j.contract.GasToken;
import io.neow3j.contract.SmartContract;
import io.neow3j.protocol.Neow3j;
import io.neow3j.protocol.core.response.NeoInvokeFunction;
import io.neow3j.protocol.core.stackitem.StackItem;
import io.neow3j.test.ContractTest;
import io.neow3j.test.ContractTestExtension;
import io.neow3j.transaction.AccountSigner;
import io.neow3j.transaction.Transaction;
import io.neow3j.transaction.TransactionBuilder;
import io.neow3j.types.ContractParameter;
import io.neow3j.types.Hash256;
import io.neow3j.utils.Await;
import io.neow3j.wallet.Account;
import com.smartargs.vesting.helpers.TestNep17Token;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.List;

import static io.neow3j.types.ContractParameter.array;
import static io.neow3j.types.ContractParameter.bool;
import static io.neow3j.types.ContractParameter.byteArray;
import static io.neow3j.types.ContractParameter.hash160;
import static io.neow3j.types.ContractParameter.integer;
import static io.neow3j.types.ContractParameter.string;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * End-to-end behavioural tests for {@link VestingVault}.
 *
 * <p>Covers plan §3.9: cliff/linear schedules end-to-end, claim access control,
 * revoke flow, invalid-schedule rejection, multi-token isolation. Stepped
 * vesting is exercised via {@link ScheduleMathTest} (it requires off-chain
 * tranche serialization which is messier in this harness).
 */
@ContractTest(blockTime = 1, contracts = { TestNep17Token.class, VestingVault.class })
public class VestingVaultTest {

    @RegisterExtension
    private static final ContractTestExtension ext = new ContractTestExtension();

    private static Neow3j neow3j;
    private static SmartContract vault;
    private static SmartContract token;
    /** Single-sig depositor created by neo-express, funded with GAS by the genesis multi-sig. */
    private static Account depositor;
    /** Single-sig beneficiary, also funded with GAS so it can call claim()/revoke(). */
    private static Account beneficiary;

    /** 100 GAS — comfortable headroom for tx fees across all tests. */
    private static final BigInteger GAS_FUNDING = BigInteger.valueOf(100).multiply(BigInteger.TEN.pow(8));
    /** Test-token initial mint (token has 8 decimals; this is 10^14 / 10^8 = 1M tokens). */
    private static final BigInteger INITIAL_MINT = new BigInteger("100000000000000");

    @BeforeAll
    static void setUp() throws Throwable {
        neow3j = ext.getNeow3j();
        token  = ext.getDeployedContract(TestNep17Token.class);
        vault  = ext.getDeployedContract(VestingVault.class);

        // Fresh single-sig accounts for the test runs.
        depositor   = ext.createAccount();
        beneficiary = ext.createAccount();

        // Genesis multi-sig: signs by attaching a multi-sig witness assembled from
        // the underlying single-sig keys (see ContractTestExtension's own deploy).
        ContractTestExtension.GenesisAccount genesis = ext.getGenesisAccount();
        Account multiSig = genesis.getMultiSigAccount();
        Account[] signers = genesis.getSignerAccounts();

        GasToken gas = new GasToken(neow3j);
        fundFromGenesis(gas, depositor.getScriptHash(),   GAS_FUNDING, multiSig, signers);
        fundFromGenesis(gas, beneficiary.getScriptHash(), GAS_FUNDING, multiSig, signers);

        // mint() is unwitnessed, so the depositor (now funded) can sign it themselves.
        Hash256 mintTx = token.invokeFunction("mint",
                        hash160(depositor.getScriptHash()),
                        integer(INITIAL_MINT))
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(mintTx, neow3j);
    }

    private static void fundFromGenesis(GasToken gas, io.neow3j.types.Hash160 to, BigInteger amount,
                                        Account multiSig, Account[] signers) throws Throwable {
        TransactionBuilder b = gas.transfer(multiSig, to, amount)
                .signers(AccountSigner.calledByEntry(multiSig));
        Transaction tx = b.getUnsignedTransaction()
                .addMultiSigWitness(multiSig.getVerificationScript(), signers);
        Hash256 hash = tx.send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(hash, neow3j);
    }

    // ---------- Cliff ----------

    @Test
    void cliffVesting_zeroBeforeStart_fullAtStart() throws Throwable {
        long now = chainTimeSec();
        long startAt = now + 100;             // 100s in the future
        BigInteger amount = BigInteger.valueOf(1_000_000_00L); // 1 token

        int lockId = createLock(amount,
                /*type=*/0, startAt, startAt, 0L, /*tranches=*/null,
                "team", "Cliff at +100s", false);

        assertThat(vestedAmount(lockId)).isEqualTo(BigInteger.ZERO);

        ext.fastForward(50, 1); // halfway to cliff
        assertThat(vestedAmount(lockId)).isEqualTo(BigInteger.ZERO);

        ext.fastForward(60, 1); // past the cliff
        assertThat(vestedAmount(lockId)).isEqualTo(amount);
        assertThat(claimableAmount(lockId)).isEqualTo(amount);

        // Beneficiary claims and receives full balance.
        BigInteger before = balanceOf(beneficiary.getScriptHash());
        Hash256 claimTx = vault.invokeFunction("claim", integer(lockId))
                .signers(AccountSigner.calledByEntry(beneficiary))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(claimTx, neow3j);
        BigInteger after = balanceOf(beneficiary.getScriptHash());
        assertThat(after.subtract(before)).isEqualTo(amount);

        // Re-claim now reverts (nothing left).
        assertThatThrownBy(() ->
                vault.invokeFunction("claim", integer(lockId))
                        .signers(AccountSigner.calledByEntry(beneficiary))
                        .sign().send()
        ).hasMessageContaining("ABORT");
    }

    // ---------- Linear ----------

    @Test
    void linearVesting_respectsCliffAndLinearMath() throws Throwable {
        long now = chainTimeSec();
        long start = now + 10;
        long cliff = now + 110;        // 100s after start
        long end   = now + 410;        // 400s after start, 300s after cliff

        BigInteger amount = BigInteger.valueOf(400_000_000L); // pick clean numbers for the math
        int lockId = createLock(amount, 1, start, end, cliff, null,
                "team", "Linear w/ cliff", false);

        // Before cliff: nothing.
        ext.fastForward(50, 1);
        assertThat(vestedAmount(lockId)).isEqualTo(BigInteger.ZERO);

        // At cliff: exactly the elapsed-time fraction since `start` (≈100/400 = 25%).
        ext.fastForward(70, 1); // total +120s -> past the cliff at +110s
        BigInteger atCliff = vestedAmount(lockId);
        assertThat(atCliff).isGreaterThanOrEqualTo(BigInteger.valueOf(amount.longValue() * 100 / 400))
                .isLessThan(amount);

        // Past the end.
        ext.fastForward(500, 1);
        assertThat(vestedAmount(lockId)).isEqualTo(amount);
    }

    // ---------- Access control ----------

    @Test
    void claim_rejectsNonBeneficiary() throws Throwable {
        long now = chainTimeSec();
        BigInteger amount = BigInteger.valueOf(50_000_000L);
        int lockId = createLock(amount, 0, now + 1, now + 1, 0L, null,
                "team", "Tiny cliff", false);
        ext.fastForward(5, 1);

        // Depositor (genesis) is not the beneficiary; claim must abort.
        assertThatThrownBy(() ->
                vault.invokeFunction("claim", integer(lockId))
                        .signers(AccountSigner.calledByEntry(depositor))
                        .sign().send()
        ).hasMessageContaining("ABORT");
    }

    // ---------- Revoke ----------

    @Test
    void revoke_returnsUnvested_beneficiaryKeepsVested() throws Throwable {
        long now = chainTimeSec();
        long start = now + 1;
        long end   = now + 401;     // 400s schedule

        BigInteger amount = BigInteger.valueOf(800_000_000L);
        int lockId = createLock(amount, 1, start, end, 0L, null,
                "team", "Revocable linear", true);

        // Halfway through.
        ext.fastForward(200, 1);
        BigInteger vestedHalf = vestedAmount(lockId);
        assertThat(vestedHalf).isGreaterThan(BigInteger.ZERO).isLessThan(amount);

        BigInteger depositorBefore = balanceOf(depositor.getScriptHash());

        Hash256 revokeTx = vault.invokeFunction("revoke", integer(lockId))
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(revokeTx, neow3j);

        // Depositor got back the unvested portion.
        BigInteger depositorAfter = balanceOf(depositor.getScriptHash());
        BigInteger refund = depositorAfter.subtract(depositorBefore);
        assertThat(refund).isPositive().isLessThan(amount);

        // Subsequent fastForward does not vest anything more — schedule is frozen.
        ext.fastForward(1000, 1);
        BigInteger vestedAfter = vestedAmount(lockId);
        assertThat(vestedAfter).isEqualTo(amount.subtract(refund));

        // Beneficiary can still claim what was already vested.
        BigInteger benBefore = balanceOf(beneficiary.getScriptHash());
        Hash256 claimTx = vault.invokeFunction("claim", integer(lockId))
                .signers(AccountSigner.calledByEntry(beneficiary))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(claimTx, neow3j);
        BigInteger benAfter = balanceOf(beneficiary.getScriptHash());
        assertThat(benAfter.subtract(benBefore)).isEqualTo(vestedAfter);
    }

    @Test
    void revoke_rejectsIfNotRevocable() throws Throwable {
        long now = chainTimeSec();
        int lockId = createLock(BigInteger.valueOf(10_000_000L),
                0, now + 1, now + 1, 0L, null, "team", "Not revocable", false);

        assertThatThrownBy(() ->
                vault.invokeFunction("revoke", integer(lockId))
                        .signers(AccountSigner.calledByEntry(depositor))
                        .sign().send()
        ).hasMessageContaining("ABORT");
    }

    // ---------- Validation ----------

    @Test
    void invalidSchedule_rejectsAtCreation() throws Throwable {
        long now = chainTimeSec();
        BigInteger before = balanceOf(depositor.getScriptHash());

        // Linear with start >= end — must abort, depositor keeps the tokens.
        ContractParameter data = array(
                hash160(beneficiary.getScriptHash()),
                integer(1),                          // linear
                integer(BigInteger.valueOf(now + 200)),
                integer(BigInteger.valueOf(now + 100)), // end < start
                integer(0),
                byteArray(""),
                string("team"),
                string("bad"),
                bool(false)
        );

        assertThatThrownBy(() ->
                token.invokeFunction("transfer",
                                hash160(depositor.getScriptHash()),
                                hash160(vault.getScriptHash()),
                                integer(BigInteger.valueOf(123_000_000L)),
                                data)
                        .signers(AccountSigner.calledByEntry(depositor))
                        .sign().send()
        ).hasMessageContaining("ABORT");

        // Depositor's balance must be unchanged.
        assertThat(balanceOf(depositor.getScriptHash())).isEqualTo(before);
    }

    // ---------- Helpers ----------

    /** Returns the new lockId. */
    private int createLock(BigInteger amount, int scheduleType,
                           long startSec, long endSec, long cliffSec,
                           ContractParameter tranches,
                           String category, String note, boolean revocable) throws Throwable {
        ContractParameter data = array(
                hash160(beneficiary.getScriptHash()),
                integer(scheduleType),
                integer(BigInteger.valueOf(startSec)),
                integer(BigInteger.valueOf(endSec)),
                integer(BigInteger.valueOf(cliffSec)),
                tranches != null ? tranches : byteArray(""),
                string(category),
                string(note),
                bool(revocable)
        );

        BigInteger countBefore = (BigInteger) vault.callInvokeFunction("getLockCount")
                .getInvocationResult().getStack().get(0).getInteger();

        Hash256 tx = token.invokeFunction("transfer",
                        hash160(depositor.getScriptHash()),
                        hash160(vault.getScriptHash()),
                        integer(amount),
                        data)
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(tx, neow3j);

        BigInteger countAfter = (BigInteger) vault.callInvokeFunction("getLockCount")
                .getInvocationResult().getStack().get(0).getInteger();
        assertThat(countAfter).isEqualTo(countBefore.add(BigInteger.ONE));

        return countAfter.intValue();
    }

    private BigInteger vestedAmount(int lockId) throws Throwable {
        NeoInvokeFunction r = vault.callInvokeFunction("vestedAmount",
                Arrays.asList(integer(lockId)));
        return r.getInvocationResult().getStack().get(0).getInteger();
    }

    private BigInteger claimableAmount(int lockId) throws Throwable {
        NeoInvokeFunction r = vault.callInvokeFunction("claimableAmount",
                Arrays.asList(integer(lockId)));
        return r.getInvocationResult().getStack().get(0).getInteger();
    }

    private BigInteger balanceOf(io.neow3j.types.Hash160 account) throws Throwable {
        NeoInvokeFunction r = token.callInvokeFunction("balanceOf",
                Arrays.asList(hash160(account)));
        return r.getInvocationResult().getStack().get(0).getInteger();
    }

    /** Latest block timestamp, in seconds. */
    private long chainTimeSec() throws Throwable {
        java.math.BigInteger blockIdx = neow3j.getBlockCount().send().getBlockCount().subtract(BigInteger.ONE);
        long ms = neow3j.getBlock(blockIdx, false).send().getBlock().getTime();
        return ms / 1000;
    }

    @SuppressWarnings("unused")
    private static List<StackItem> stack(NeoInvokeFunction r) {
        return r.getInvocationResult().getStack();
    }
}
