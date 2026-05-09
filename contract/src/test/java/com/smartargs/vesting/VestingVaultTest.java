package com.smartargs.vesting;

import com.smartargs.vesting.helpers.LyingNep17Token;
import com.smartargs.vesting.helpers.ReentrantNep17Token;
import com.smartargs.vesting.helpers.TestNep17Token;
import io.neow3j.contract.SmartContract;
import io.neow3j.protocol.Neow3j;
import io.neow3j.protocol.core.response.NeoInvokeFunction;
import io.neow3j.protocol.core.stackitem.StackItem;
import io.neow3j.test.ContractTest;
import io.neow3j.test.ContractTestExtension;
import io.neow3j.transaction.AccountSigner;
import io.neow3j.types.ContractParameter;
import io.neow3j.types.Hash160;
import io.neow3j.types.Hash256;
import io.neow3j.utils.Await;
import io.neow3j.wallet.Account;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static com.smartargs.vesting.helpers.TestHelper.assertAborted;
import static com.smartargs.vesting.helpers.TestHelper.fundWithGas;
import static com.smartargs.vesting.helpers.TestHelper.mintTokens;
import static io.neow3j.types.ContractParameter.any;
import static io.neow3j.types.ContractParameter.array;
import static io.neow3j.types.ContractParameter.bool;
import static io.neow3j.types.ContractParameter.byteArray;
import static io.neow3j.types.ContractParameter.hash160;
import static io.neow3j.types.ContractParameter.integer;
import static io.neow3j.types.ContractParameter.string;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-end behavioural tests for {@link VestingVault}.
 *
 * <p>Every reachable {@code Helper.abort("VV: …")} site in the contract has
 * a corresponding test. Each test name reads as a one-line spec for the
 * method under test — the assertions document exact behaviour. Sections,
 * in order:
 *
 * <ol>
 *   <li><b>Lifecycle</b>: cliff/linear/stepped happy paths through claim.</li>
 *   <li><b>Schedule math</b>: vestedAmount / claimableAmount edges.</li>
 *   <li><b>onPayment validation</b>: every reachable abort in the deposit
 *       path.</li>
 *   <li><b>claim / revoke</b>: every reachable abort + multi-claim
 *       accumulation, schedule-freeze verification, outbound-transfer
 *       failure, and re-entrancy guard.</li>
 *   <li><b>Read methods</b>: getLock / getLockCount / totalLocked.</li>
 *   <li><b>Iterators</b>: per-beneficiary, per-depositor, per-token sets.</li>
 * </ol>
 *
 * <p>The adversarial paths are exercised against two purpose-built test
 * contracts in {@code helpers/}: {@link LyingNep17Token} (returns false
 * from contract-originated transfers, exercises {@code "VV: transfer
 * failed"} and {@code "VV: refund failed"}) and {@link ReentrantNep17Token}
 * (whose transfer callback re-enters {@code vault.claim}, exercising
 * {@code "VV: re-entry"}).
 *
 * <p>The only abort site without a test is {@code "VV: no calling token"} —
 * it's only reachable if {@code Runtime.getCallingScriptHash()} returns
 * null, which can't happen inside a real NEP-17 callback flow. Kept as
 * defensive code against future API changes.
 */
@ContractTest(blockTime = 1, contracts = {
        TestNep17Token.class,
        LyingNep17Token.class,
        ReentrantNep17Token.class,
        VestingVault.class
})
public class VestingVaultTest {

    @RegisterExtension
    private static final ContractTestExtension ext = new ContractTestExtension();

    private static Neow3j neow3j;
    private static SmartContract vault;
    private static SmartContract token;
    /** Lying NEP-17: returns false from any transfer where the sender is a contract. */
    private static SmartContract lyingToken;
    /** Re-entrant NEP-17: when the vault calls transfer, it re-enters vault.claim. */
    private static SmartContract reentrantToken;
    private static Account depositor;
    private static Account beneficiary;
    /** Third party — not depositor, not beneficiary. Used to test access control. */
    private static Account stranger;

    private static final BigInteger GAS_FUNDING = BigInteger.valueOf(100).multiply(BigInteger.TEN.pow(8));
    private static final BigInteger INITIAL_MINT = new BigInteger("100000000000000"); // 1M tokens, 8 decimals

    // ============================================================
    // Setup
    // ============================================================

    @BeforeAll
    static void setUp() throws Throwable {
        neow3j = ext.getNeow3j();
        // Required so transactions that abort on-chain still get mined and
        // their FAULT state can be read from the application log.
        neow3j.allowTransmissionOnFault();

        token          = ext.getDeployedContract(TestNep17Token.class);
        lyingToken     = ext.getDeployedContract(LyingNep17Token.class);
        reentrantToken = ext.getDeployedContract(ReentrantNep17Token.class);
        vault          = ext.getDeployedContract(VestingVault.class);

        depositor   = Account.create();
        beneficiary = Account.create();
        stranger    = Account.create();

        fundWithGas(neow3j, ext, depositor.getScriptHash(),   GAS_FUNDING);
        fundWithGas(neow3j, ext, beneficiary.getScriptHash(), GAS_FUNDING);
        fundWithGas(neow3j, ext, stranger.getScriptHash(),    GAS_FUNDING);

        mintTokens(token, depositor, depositor.getScriptHash(), INITIAL_MINT, neow3j);
    }

    // ============================================================
    // 1. Lifecycle
    // ============================================================

    @Test
    void cliff_creates_vests_atomically_atStart() throws Throwable {
        // Cliff schedule: 0% before startTime, 100% from startTime onwards.
        // The end timestamp is normalized to startTime by onPayment.
        long now = chainTimeSec();
        long start = now + 100;
        BigInteger amount = BigInteger.valueOf(1_000_000_00L);

        int lockId = createLock(amount, /*type=*/0, start, start, /*cliff=*/0L, /*tranches=*/null,
                "team", "Cliff at +100s", false);

        assertThat(vestedAmount(lockId)).isEqualTo(BigInteger.ZERO);
        ext.fastForwardOneBlock(50);
        assertThat(vestedAmount(lockId)).isEqualTo(BigInteger.ZERO);

        ext.fastForwardOneBlock(60);
        assertThat(vestedAmount(lockId)).isEqualTo(amount);
        assertThat(claimableAmount(lockId)).isEqualTo(amount);

        BigInteger before = balanceOf(beneficiary.getScriptHash());
        invokeAsBeneficiary("claim", integer(lockId));
        assertThat(balanceOf(beneficiary.getScriptHash()).subtract(before)).isEqualTo(amount);
        assertThat(claimableAmount(lockId)).isEqualTo(BigInteger.ZERO);
    }

    @Test
    void linear_withCliff_isFlatThenLinearThenFull() throws Throwable {
        // Linear: 0 before cliff, accruing as (now-startTime)/(endTime-startTime)
        // once past the cliff, capped at totalAmount once at/after endTime.
        long now = chainTimeSec();
        long start = now + 10;
        long cliff = now + 110;
        long end   = now + 410;

        BigInteger amount = BigInteger.valueOf(400_000_000L);
        int lockId = createLock(amount, 1, start, end, cliff, null,
                "team", "Linear w/ cliff", false);

        ext.fastForwardOneBlock(50); // before cliff
        assertThat(vestedAmount(lockId)).isEqualTo(BigInteger.ZERO);

        ext.fastForwardOneBlock(70); // ~120s elapsed; past cliff
        BigInteger atCliff = vestedAmount(lockId);
        assertThat(atCliff)
                .isGreaterThanOrEqualTo(BigInteger.valueOf(amount.longValue() * 100 / 400))
                .isLessThan(amount);

        ext.fastForwardOneBlock(500); // past end
        assertThat(vestedAmount(lockId)).isEqualTo(amount);
    }

    @Test
    void linear_noCliff_vestsImmediatelyAfterStart() throws Throwable {
        // Linear without an explicit cliff (cliffTime == 0) starts vesting at
        // startTime. claimable rises continuously from there.
        long now = chainTimeSec();
        long start = now + 10;
        long end   = now + 110;
        BigInteger amount = BigInteger.valueOf(100_000_000L);

        int lockId = createLock(amount, 1, start, end, 0L, null,
                "team", "Linear no cliff", false);

        ext.fastForwardOneBlock(60); // ~50s into a 100s schedule
        BigInteger v = vestedAmount(lockId);
        assertThat(v).isGreaterThan(BigInteger.ZERO).isLessThan(amount);
    }

    @Test
    void stepped_unlocksTrancheByTranche() throws Throwable {
        // Stepped: tranche array is [(timestamp, amount), ...]. vestedAmount
        // sums every tranche whose timestamp <= now. start/end derived from
        // first/last tranche timestamps.
        long now = chainTimeSec();
        long t1 = now + 100;
        long t2 = now + 200;
        long t3 = now + 300;

        BigInteger a1 = BigInteger.valueOf(40_000_000L);
        BigInteger a2 = BigInteger.valueOf(30_000_000L);
        BigInteger a3 = BigInteger.valueOf(30_000_000L);
        BigInteger total = a1.add(a2).add(a3);

        ContractParameter tranches = buildTranchesBlob(new long[]{t1, t2, t3},
                new BigInteger[]{a1, a2, a3});

        int lockId = createLock(total, /*type=*/2, /*start=*/0L, /*end=*/0L, /*cliff=*/0L, tranches,
                "team", "3 tranches", false);

        assertThat(vestedAmount(lockId)).isEqualTo(BigInteger.ZERO);

        ext.fastForwardOneBlock(120); // past t1
        assertThat(vestedAmount(lockId)).isEqualTo(a1);

        ext.fastForwardOneBlock(100); // past t2
        assertThat(vestedAmount(lockId)).isEqualTo(a1.add(a2));

        ext.fastForwardOneBlock(100); // past t3
        assertThat(vestedAmount(lockId)).isEqualTo(total);
    }

    // ============================================================
    // 2. Schedule math edges
    // ============================================================

    @Test
    void claim_partialThenAll_sumsCorrectly() throws Throwable {
        // Multi-claim: claim halfway through a linear schedule, then again
        // at the end. The two claim amounts together equal totalAmount.
        long now = chainTimeSec();
        long start = now + 10;
        long end   = now + 410;
        BigInteger amount = BigInteger.valueOf(800_000_000L);

        int lockId = createLock(amount, 1, start, end, 0L, null,
                "team", "Multi-claim", false);

        ext.fastForwardOneBlock(210); // ~halfway
        BigInteger before1 = balanceOf(beneficiary.getScriptHash());
        invokeAsBeneficiary("claim", integer(lockId));
        BigInteger received1 = balanceOf(beneficiary.getScriptHash()).subtract(before1);
        assertThat(received1).isPositive().isLessThan(amount);

        ext.fastForwardOneBlock(500); // past end
        BigInteger before2 = balanceOf(beneficiary.getScriptHash());
        invokeAsBeneficiary("claim", integer(lockId));
        BigInteger received2 = balanceOf(beneficiary.getScriptHash()).subtract(before2);

        assertThat(received1.add(received2)).isEqualTo(amount);
    }

    @Test
    void vestedAmount_unknownLock_returnsZero() throws Throwable {
        // Reading a non-existent lockId is not an error — returns 0.
        assertThat(vestedAmount(999_999)).isEqualTo(BigInteger.ZERO);
    }

    @Test
    void claimableAmount_unknownLock_returnsZero() throws Throwable {
        assertThat(claimableAmount(999_999)).isEqualTo(BigInteger.ZERO);
    }

    // ============================================================
    // 3. onPayment validation — every reachable abort
    // ============================================================

    @Test
    void payment_zeroAmount_aborts() throws Throwable {
        // amount must be > 0; a zero-value transfer still triggers onPayment
        // because NEP-17 spec mandates calling the receiver hook even at zero.
        Hash256 tx = transferToVault(BigInteger.ZERO, defaultLockData(0, futureTime(60), futureTime(60), 0L, null));
        assertAborted(tx, "VV: bad amount", neow3j);
    }

    @Test
    void payment_dataNull_aborts() throws Throwable {
        // The contract requires a non-null Object[9] data payload.
        Hash256 tx = token.invokeFunction("transfer",
                        hash160(depositor.getScriptHash()),
                        hash160(vault.getScriptHash()),
                        integer(BigInteger.valueOf(1_000_000L)),
                        any(null))
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        assertAborted(tx, "VV: no data", neow3j);
    }

    @Test
    void payment_dataWrongLength_aborts() throws Throwable {
        // params.length must equal 9.
        ContractParameter shortData = array(integer(0), integer(0), integer(0));
        Hash256 tx = token.invokeFunction("transfer",
                        hash160(depositor.getScriptHash()),
                        hash160(vault.getScriptHash()),
                        integer(BigInteger.valueOf(1_000_000L)),
                        shortData)
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        assertAborted(tx, "VV: bad data length", neow3j);
    }

    @Test
    void payment_zeroBeneficiary_aborts() throws Throwable {
        // Beneficiary must be a real address — Hash160.zero() is rejected.
        Hash160 zero = new Hash160(new byte[20]);
        ContractParameter data = lockData(zero, 0, futureTime(60), futureTime(60), 0L, null,
                "team", "zero ben", false);
        Hash256 tx = transferToVault(BigInteger.valueOf(1_000_000L), data);
        assertAborted(tx, "VV: bad beneficiary", neow3j);
    }

    @Test
    void payment_vaultAsBeneficiary_aborts() throws Throwable {
        // The vault may not be its own beneficiary — would let any wallet
        // signer drain the vault by claiming on its behalf.
        ContractParameter data = lockData(vault.getScriptHash(), 0, futureTime(60), futureTime(60), 0L, null,
                "team", "self-ben", false);
        Hash256 tx = transferToVault(BigInteger.valueOf(1_000_000L), data);
        assertAborted(tx, "VV: self-beneficiary", neow3j);
    }

    @Test
    void payment_categoryTooLong_aborts() throws Throwable {
        // category must be ≤ 32 characters.
        String tooLong = repeat('x', 33);
        ContractParameter data = lockData(beneficiary.getScriptHash(), 0, futureTime(60), futureTime(60), 0L, null,
                tooLong, "note", false);
        Hash256 tx = transferToVault(BigInteger.valueOf(1_000_000L), data);
        assertAborted(tx, "VV: bad category", neow3j);
    }

    @Test
    void payment_noteTooLong_aborts() throws Throwable {
        // note must be ≤ 256 characters (or null/empty).
        String tooLong = repeat('y', 257);
        ContractParameter data = lockData(beneficiary.getScriptHash(), 0, futureTime(60), futureTime(60), 0L, null,
                "team", tooLong, false);
        Hash256 tx = transferToVault(BigInteger.valueOf(1_000_000L), data);
        assertAborted(tx, "VV: bad note", neow3j);
    }

    @Test
    void payment_cliffStartInPast_aborts() throws Throwable {
        // Cliff schedules must have startTime strictly in the future.
        long now = chainTimeSec();
        ContractParameter data = lockData(beneficiary.getScriptHash(), /*type=*/0, /*start=*/now - 100,
                /*end=*/now - 100, /*cliff=*/0L, null, "team", "past cliff", false);
        Hash256 tx = transferToVault(BigInteger.valueOf(1_000_000L), data);
        assertAborted(tx, "VV: cliff in past", neow3j);
    }

    @Test
    void payment_linearStartGreaterThanEnd_aborts() throws Throwable {
        // Linear schedules must have startTime < endTime.
        long now = chainTimeSec();
        ContractParameter data = lockData(beneficiary.getScriptHash(), 1, now + 200, now + 100, 0L, null,
                "team", "bad range", false);
        Hash256 tx = transferToVault(BigInteger.valueOf(1_000_000L), data);
        assertAborted(tx, "VV: bad linear range", neow3j);
    }

    @Test
    void payment_linearCliffOutOfRange_aborts() throws Throwable {
        // If cliffTime is non-zero it must lie within [startTime, endTime].
        long now = chainTimeSec();
        ContractParameter data = lockData(beneficiary.getScriptHash(), 1, now + 100, now + 200,
                now + 500 /*cliff past end*/, null, "team", "cliff out", false);
        Hash256 tx = transferToVault(BigInteger.valueOf(1_000_000L), data);
        assertAborted(tx, "VV: cliff out of range", neow3j);
    }

    @Test
    void payment_unknownScheduleType_aborts() throws Throwable {
        // Schedule type must be 0 (Cliff), 1 (Linear), or 2 (Stepped).
        ContractParameter data = lockData(beneficiary.getScriptHash(), /*type=*/9,
                futureTime(60), futureTime(60), 0L, null, "team", "weird", false);
        Hash256 tx = transferToVault(BigInteger.valueOf(1_000_000L), data);
        assertAborted(tx, "VV: bad schedule type", neow3j);
    }

    // -- Stepped-specific validation --

    @Test
    void payment_steppedNoTranches_aborts() throws Throwable {
        // Stepped requires a non-empty tranches blob.
        ContractParameter data = lockData(beneficiary.getScriptHash(), 2, 0L, 0L, 0L,
                byteArray(""), "team", "no tranches", false);
        Hash256 tx = transferToVault(BigInteger.valueOf(1_000_000L), data);
        assertAborted(tx, "VV: no tranches", neow3j);
    }

    @Test
    void payment_steppedTooManyTranches_aborts() throws Throwable {
        // Tranche count is capped at 64 to bound the per-claim GAS cost.
        long now = chainTimeSec();
        long[] ts = new long[65];
        BigInteger[] amts = new BigInteger[65];
        for (int i = 0; i < 65; i++) {
            ts[i] = now + 100 + i * 10;
            amts[i] = BigInteger.valueOf(1_000_000L);
        }
        ContractParameter tranches = buildTranchesBlob(ts, amts);
        ContractParameter data = lockData(beneficiary.getScriptHash(), 2, 0L, 0L, 0L, tranches,
                "team", "65 tranches", false);
        Hash256 tx = transferToVault(BigInteger.valueOf(65_000_000L), data);
        assertAborted(tx, "VV: too many tranches", neow3j);
    }

    @Test
    void payment_steppedUnsortedTranches_aborts() throws Throwable {
        // Tranche timestamps must be strictly ascending.
        long now = chainTimeSec();
        ContractParameter tranches = buildTranchesBlob(
                new long[]{now + 200, now + 100},
                new BigInteger[]{BigInteger.valueOf(500_000L), BigInteger.valueOf(500_000L)});
        ContractParameter data = lockData(beneficiary.getScriptHash(), 2, 0L, 0L, 0L, tranches,
                "team", "unsorted", false);
        Hash256 tx = transferToVault(BigInteger.valueOf(1_000_000L), data);
        assertAborted(tx, "VV: tranches unsorted", neow3j);
    }

    @Test
    void payment_steppedTrancheInPast_aborts() throws Throwable {
        // All tranche timestamps must be in the future at creation time.
        long now = chainTimeSec();
        ContractParameter tranches = buildTranchesBlob(
                new long[]{now - 100, now + 100},
                new BigInteger[]{BigInteger.valueOf(500_000L), BigInteger.valueOf(500_000L)});
        ContractParameter data = lockData(beneficiary.getScriptHash(), 2, 0L, 0L, 0L, tranches,
                "team", "past tranche", false);
        Hash256 tx = transferToVault(BigInteger.valueOf(1_000_000L), data);
        assertAborted(tx, "VV: tranche in past", neow3j);
    }

    @Test
    void payment_steppedZeroTrancheAmount_aborts() throws Throwable {
        // Each tranche amount must be > 0.
        long now = chainTimeSec();
        ContractParameter tranches = buildTranchesBlob(
                new long[]{now + 100, now + 200},
                new BigInteger[]{BigInteger.ZERO, BigInteger.valueOf(1_000_000L)});
        ContractParameter data = lockData(beneficiary.getScriptHash(), 2, 0L, 0L, 0L, tranches,
                "team", "zero amt", false);
        Hash256 tx = transferToVault(BigInteger.valueOf(1_000_000L), data);
        assertAborted(tx, "VV: bad tranche amount", neow3j);
    }

    @Test
    void payment_steppedSumMismatch_aborts() throws Throwable {
        // Sum of tranche amounts must equal the total transferred.
        long now = chainTimeSec();
        ContractParameter tranches = buildTranchesBlob(
                new long[]{now + 100, now + 200},
                new BigInteger[]{BigInteger.valueOf(400_000L), BigInteger.valueOf(400_000L)});
        // Transfer 1_000_000 but tranches sum to 800_000.
        ContractParameter data = lockData(beneficiary.getScriptHash(), 2, 0L, 0L, 0L, tranches,
                "team", "sum mismatch", false);
        Hash256 tx = transferToVault(BigInteger.valueOf(1_000_000L), data);
        assertAborted(tx, "VV: tranche sum mismatch", neow3j);
    }

    // ============================================================
    // 4. claim — every reachable abort + state assertions
    // ============================================================

    @Test
    void claim_unknownLock_aborts() throws Throwable {
        // claim on a lockId that was never created.
        Hash256 tx = vault.invokeFunction("claim", integer(999_999))
                .signers(AccountSigner.calledByEntry(beneficiary))
                .sign().send().getSendRawTransaction().getHash();
        assertAborted(tx, "VV: lock not found", neow3j);
    }

    @Test
    void claim_byNonBeneficiary_aborts() throws Throwable {
        // Only the recorded beneficiary may claim.
        long now = chainTimeSec();
        int lockId = createLock(BigInteger.valueOf(50_000_000L), 0, now + 60, now + 60, 0L, null,
                "team", "tiny cliff", false);
        ext.fastForwardOneBlock(120);

        Hash256 tx = vault.invokeFunction("claim", integer(lockId))
                .signers(AccountSigner.calledByEntry(stranger))
                .sign().send().getSendRawTransaction().getHash();
        assertAborted(tx, "VV: not beneficiary", neow3j);
    }

    @Test
    void claim_beforeAnythingVested_aborts() throws Throwable {
        // claimable must be > 0; calling claim before any vesting aborts.
        long now = chainTimeSec();
        int lockId = createLock(BigInteger.valueOf(50_000_000L), 0, now + 1000, now + 1000, 0L, null,
                "team", "far future", false);

        Hash256 tx = vault.invokeFunction("claim", integer(lockId))
                .signers(AccountSigner.calledByEntry(beneficiary))
                .sign().send().getSendRawTransaction().getHash();
        assertAborted(tx, "VV: nothing to claim", neow3j);
    }

    @Test
    void claim_alreadyFullyClaimed_aborts() throws Throwable {
        // Re-claim after fully claiming a vested cliff is rejected.
        long now = chainTimeSec();
        BigInteger amount = BigInteger.valueOf(20_000_000L);
        int lockId = createLock(amount, 0, now + 60, now + 60, 0L, null,
                "team", "claim twice", false);
        ext.fastForwardOneBlock(120);
        invokeAsBeneficiary("claim", integer(lockId));

        Hash256 tx = vault.invokeFunction("claim", integer(lockId))
                .signers(AccountSigner.calledByEntry(beneficiary))
                .sign().send().getSendRawTransaction().getHash();
        assertAborted(tx, "VV: nothing to claim", neow3j);
    }

    /**
     * Vault's outbound {@code Contract.call(token, "transfer", ...)} returns
     * false from a "lying" NEP-17 token. The vault must reject the failed
     * payout so the beneficiary's {@code claimedAmount} update doesn't get
     * recorded against tokens that never moved.
     */
    @Test
    void claim_transferFailed_aborts() throws Throwable {
        // Mint and deposit the lying token. Inbound from EOA → vault works
        // normally so we get a valid lock; outbound from vault → beneficiary
        // is what fails.
        BigInteger amount = BigInteger.valueOf(1_000_000_00L);
        mintLyingTokens(amount);

        ContractParameter data = lockData(beneficiary.getScriptHash(), 0,
                futureTime(60), futureTime(60), 0L, null,
                "team", "lying-token cliff", false);
        Hash256 depTx = lyingToken.invokeFunction("transfer",
                        hash160(depositor.getScriptHash()),
                        hash160(vault.getScriptHash()),
                        integer(amount),
                        data)
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(depTx, neow3j);
        int lockId = lockCount().intValue();

        ext.fastForwardOneBlock(120); // past the cliff

        Hash256 claimTx = vault.invokeFunction("claim", integer(lockId))
                .signers(AccountSigner.calledByEntry(beneficiary))
                .sign().send().getSendRawTransaction().getHash();
        assertAborted(claimTx, "VV: transfer failed", neow3j);
    }

    /**
     * Vault's outbound {@code Contract.call} during {@code revoke} hits the
     * same lying token. The depositor's refund must be rejected with
     * {@code "VV: refund failed"}.
     */
    @Test
    void revoke_refundFailed_aborts() throws Throwable {
        BigInteger amount = BigInteger.valueOf(1_000_000_00L);
        mintLyingTokens(amount);

        long now = chainTimeSec();
        ContractParameter data = lockData(beneficiary.getScriptHash(), 1,
                now + 1, now + 401, 0L, null,
                "team", "lying-token linear", true /* revocable */);
        Hash256 depTx = lyingToken.invokeFunction("transfer",
                        hash160(depositor.getScriptHash()),
                        hash160(vault.getScriptHash()),
                        integer(amount),
                        data)
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(depTx, neow3j);
        int lockId = lockCount().intValue();

        ext.fastForwardOneBlock(100); // partially vested — revoke must refund the unvested portion

        Hash256 revokeTx = vault.invokeFunction("revoke", integer(lockId))
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        assertAborted(revokeTx, "VV: refund failed", neow3j);
    }

    /**
     * The re-entry guard ({@code Runtime.getInvocationCounter() != 1}) catches
     * a nested call into the vault from inside the outbound transfer. We
     * arm a re-entrant NEP-17 to call back into {@code vault.claim} when the
     * vault transfers tokens out — the inner claim's guard fires before any
     * state mutation, faulting the entire transaction.
     */
    @Test
    void reentry_aborts() throws Throwable {
        BigInteger amount = BigInteger.valueOf(2_000_000_00L);
        mintReentrantTokens(amount);

        ContractParameter data = lockData(beneficiary.getScriptHash(), 0,
                futureTime(60), futureTime(60), 0L, null,
                "team", "reentrant-token cliff", false);
        Hash256 depTx = reentrantToken.invokeFunction("transfer",
                        hash160(depositor.getScriptHash()),
                        hash160(vault.getScriptHash()),
                        integer(amount),
                        data)
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(depTx, neow3j);
        int lockId = lockCount().intValue();

        ext.fastForwardOneBlock(120); // past the cliff so the inner claim WOULD succeed

        // Arm the attack: when the vault's claim calls token.transfer(vault,
        // beneficiary, amount, ""), the token re-enters vault.claim(lockId).
        Hash256 armTx = reentrantToken.invokeFunction("setReentryTarget", integer(lockId))
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(armTx, neow3j);

        Hash256 claimTx = vault.invokeFunction("claim", integer(lockId))
                .signers(AccountSigner.global(beneficiary))   // global so witness propagates into the nested call
                .sign().send().getSendRawTransaction().getHash();
        assertAborted(claimTx, "VV: re-entry", neow3j);
    }

    // ============================================================
    // 5. revoke — every reachable abort + state freeze
    // ============================================================

    @Test
    void revoke_returnsUnvested_freezesSchedule_beneficiaryKeepsVested() throws Throwable {
        // After revoke: depositor receives the unvested portion; the
        // schedule is frozen so further fastForward doesn't accrue more
        // vesting; beneficiary can still claim what was already vested.
        long now = chainTimeSec();
        long start = now + 1;
        long end   = now + 401;
        BigInteger amount = BigInteger.valueOf(800_000_000L);

        int lockId = createLock(amount, 1, start, end, 0L, null,
                "team", "revoke me", true);

        ext.fastForwardOneBlock(200);
        BigInteger vestedHalf = vestedAmount(lockId);
        assertThat(vestedHalf).isGreaterThan(BigInteger.ZERO).isLessThan(amount);

        BigInteger depBefore = balanceOf(depositor.getScriptHash());
        Hash256 revokeTx = vault.invokeFunction("revoke", integer(lockId))
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(revokeTx, neow3j);

        BigInteger refund = balanceOf(depositor.getScriptHash()).subtract(depBefore);
        assertThat(refund).isPositive().isLessThan(amount);

        ext.fastForwardOneBlock(1000);
        BigInteger vestedAfter = vestedAmount(lockId);
        assertThat(vestedAfter).isEqualTo(amount.subtract(refund));

        BigInteger benBefore = balanceOf(beneficiary.getScriptHash());
        invokeAsBeneficiary("claim", integer(lockId));
        assertThat(balanceOf(beneficiary.getScriptHash()).subtract(benBefore)).isEqualTo(vestedAfter);
    }

    @Test
    void revoke_unknownLock_aborts() throws Throwable {
        Hash256 tx = vault.invokeFunction("revoke", integer(999_999))
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        assertAborted(tx, "VV: lock not found", neow3j);
    }

    @Test
    void revoke_notRevocable_aborts() throws Throwable {
        long now = chainTimeSec();
        int lockId = createLock(BigInteger.valueOf(10_000_000L), 0, now + 60, now + 60, 0L, null,
                "team", "non-revocable", false);

        Hash256 tx = vault.invokeFunction("revoke", integer(lockId))
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        assertAborted(tx, "VV: not revocable", neow3j);
    }

    @Test
    void revoke_alreadyRevoked_aborts() throws Throwable {
        // First revoke succeeds; second on the same lock is rejected.
        long now = chainTimeSec();
        int lockId = createLock(BigInteger.valueOf(50_000_000L), 1, now + 1, now + 401, 0L, null,
                "team", "double revoke", true);
        ext.fastForwardOneBlock(100);

        Hash256 firstTx = vault.invokeFunction("revoke", integer(lockId))
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(firstTx, neow3j);

        Hash256 secondTx = vault.invokeFunction("revoke", integer(lockId))
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        assertAborted(secondTx, "VV: already revoked", neow3j);
    }

    @Test
    void revoke_byNonDepositor_aborts() throws Throwable {
        long now = chainTimeSec();
        int lockId = createLock(BigInteger.valueOf(10_000_000L), 1, now + 1, now + 401, 0L, null,
                "team", "stranger revoke", true);
        ext.fastForwardOneBlock(100);

        Hash256 tx = vault.invokeFunction("revoke", integer(lockId))
                .signers(AccountSigner.calledByEntry(stranger))
                .sign().send().getSendRawTransaction().getHash();
        assertAborted(tx, "VV: not depositor", neow3j);
    }

    // ============================================================
    // 6. Read methods
    // ============================================================

    @Test
    void getLock_returnsAllFieldsAsDeposited() throws Throwable {
        // getLock returns a Lock struct populated with every field as
        // recorded in onPayment (post-normalization).
        long now = chainTimeSec();
        long start = now + 100;
        BigInteger amount = BigInteger.valueOf(7_777_777L);
        int lockId = createLock(amount, 0, start, start, 0L, null,
                "advisor", "see-all-fields", true);

        StackItem result = vault.callInvokeFunction("getLock", Arrays.asList(integer(lockId)))
                .getInvocationResult().getStack().get(0);
        // Lock is serialized as an Array stack item; field order matches Lock.java.
        List<StackItem> fields = result.getList();
        assertThat(fields.get(0).getInteger().intValue()).isEqualTo(lockId);            // lockId
        // depositor (1) and beneficiary (2) are 20-byte hashes
        assertThat(fields.get(1).getByteArray()).isEqualTo(depositor.getScriptHash().toLittleEndianArray());
        assertThat(fields.get(2).getByteArray()).isEqualTo(beneficiary.getScriptHash().toLittleEndianArray());
        // token (3) is the test token's script hash
        assertThat(fields.get(3).getByteArray()).isEqualTo(token.getScriptHash().toLittleEndianArray());
        assertThat(fields.get(4).getInteger()).isEqualTo(amount);                       // totalAmount
        assertThat(fields.get(5).getInteger()).isEqualTo(BigInteger.ZERO);              // claimedAmount
        assertThat(fields.get(6).getInteger().intValue()).isEqualTo(0);                 // scheduleType (cliff)
        assertThat(fields.get(7).getInteger().longValue()).isEqualTo(start);            // startTime
        assertThat(fields.get(8).getInteger().longValue()).isEqualTo(start);            // endTime (cliff: clamped to start)
        // index 13 is createdAt (we don't pin its exact value)
        // Booleans on the Neo VM are integers (1/0); IntegerStackItem.getBoolean
        // throws on this neow3j version, so compare the int value directly.
        assertThat(fields.get(14).getInteger().intValue()).isEqualTo(1); // revocable
        assertThat(fields.get(15).getInteger().intValue()).isEqualTo(0); // revoked
    }

    @Test
    void getLock_unknownId_returnsNull() throws Throwable {
        // No abort — null is the documented absence value.
        StackItem result = vault.callInvokeFunction("getLock", Arrays.asList(integer(999_999)))
                .getInvocationResult().getStack().get(0);
        assertThat(result.getValue()).isNull();
    }

    @Test
    void getLockCount_incrementsByOnePerDeposit() throws Throwable {
        // getLockCount is monotonic: every successful onPayment increments it
        // by exactly one.
        long now = chainTimeSec();
        BigInteger before = lockCount();
        createLock(BigInteger.valueOf(100_000L), 0, now + 60, now + 60, 0L, null,
                "team", "count1", false);
        assertThat(lockCount()).isEqualTo(before.add(BigInteger.ONE));
        createLock(BigInteger.valueOf(200_000L), 0, now + 60, now + 60, 0L, null,
                "team", "count2", false);
        assertThat(lockCount()).isEqualTo(before.add(BigInteger.valueOf(2)));
    }

    @Test
    void totalLocked_unknownToken_isZero() throws Throwable {
        // No deposits ever made for an arbitrary token hash → 0.
        Hash160 randomToken = new Hash160(new byte[]{
                1,2,3,4,5,6,7,8,9,10, 11,12,13,14,15,16,17,18,19,20});
        BigInteger v = vault.callInvokeFunction("totalLocked", Arrays.asList(hash160(randomToken)))
                .getInvocationResult().getStack().get(0).getInteger();
        assertThat(v).isEqualTo(BigInteger.ZERO);
    }

    @Test
    void totalLocked_increasesOnDeposit_decreasesOnRevoke() throws Throwable {
        // totalLocked tracks the sum of lock totalAmounts for a given token
        // and decreases by the unvested-at-revoke amount when a lock is revoked.
        BigInteger before = totalLockedForToken();
        long now = chainTimeSec();
        BigInteger amount = BigInteger.valueOf(50_000_000L);

        int lockId = createLock(amount, 1, now + 1, now + 401, 0L, null,
                "team", "totalLocked", true);
        assertThat(totalLockedForToken()).isEqualTo(before.add(amount));

        ext.fastForwardOneBlock(100); // ~25% vested
        BigInteger vestedAtRevoke = vestedAmount(lockId);

        Hash256 tx = vault.invokeFunction("revoke", integer(lockId))
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(tx, neow3j);

        // After revoke: totalLocked drops by the unvested portion (= total - vested).
        // The vested-but-unclaimed portion stays in the vault, owed to the beneficiary.
        // Reading vestedAmount AFTER revoke gives us the frozen (clamped) value
        // exactly — no block-time slop to deal with.
        BigInteger frozenVested = vestedAmount(lockId);
        assertThat(totalLockedForToken()).isEqualTo(before.add(frozenVested));
    }

    // ============================================================
    // 7. Iterators
    // ============================================================

    @Test
    void getLocksByBeneficiary_returnsExactlyTheirLocks() throws Throwable {
        // The byBeneficiary index maps each beneficiary to the set of
        // lockIds where they receive — identical for getLocksByDepositor
        // and getLocksByToken.
        long now = chainTimeSec();
        Account otherBen = Account.create();
        // Two locks for our usual beneficiary, one for another address.
        int idA = createLock(BigInteger.valueOf(11_000_000L), 0, now + 60, now + 60, 0L, null,
                "team", "byBen-A", false);
        int idB = createLock(BigInteger.valueOf(12_000_000L), 0, now + 60, now + 60, 0L, null,
                "team", "byBen-B", false);
        int idC = createLockForBeneficiary(otherBen,
                BigInteger.valueOf(13_000_000L), 0, now + 60, now + 60, 0L, null,
                "team", "byBen-C", false);

        Set<Integer> ours = readLockIds("getLocksByBeneficiary", beneficiary.getScriptHash());
        assertThat(ours).contains(idA, idB).doesNotContain(idC);

        Set<Integer> theirs = readLockIds("getLocksByBeneficiary", otherBen.getScriptHash());
        assertThat(theirs).containsExactly(idC);
    }

    @Test
    void getLocksByDepositor_returnsExactlyTheirLocks() throws Throwable {
        long now = chainTimeSec();
        BigInteger before = lockCount();
        int idA = createLock(BigInteger.valueOf(1_000_000L), 0, now + 60, now + 60, 0L, null,
                "team", "byDep-A", false);
        int idB = createLock(BigInteger.valueOf(2_000_000L), 0, now + 60, now + 60, 0L, null,
                "team", "byDep-B", false);

        Set<Integer> ours = readLockIds("getLocksByDepositor", depositor.getScriptHash());
        // The depositor created every lock in this suite, so ours contains
        // many ids. Just check our two newest are in there and that no
        // unrelated address sees them.
        assertThat(ours).contains(idA, idB);

        Account otherDep = Account.create();
        Set<Integer> theirs = readLockIds("getLocksByDepositor", otherDep.getScriptHash());
        assertThat(theirs).isEmpty();
        assertThat(lockCount()).isGreaterThanOrEqualTo(before.add(BigInteger.valueOf(2)));
    }

    @Test
    void getLocksByBeneficiary_emptyForUnknownAddress() throws Throwable {
        Account stranger = Account.create();
        Set<Integer> ids = readLockIds("getLocksByBeneficiary", stranger.getScriptHash());
        assertThat(ids).isEmpty();
    }

    @Test
    void getLocksByToken_partitionsAcrossTokens() throws Throwable {
        // Each token's iterator returns exactly the locks deposited via that
        // token. The three iterator sets are disjoint and union to the
        // suite-wide lock count.
        Set<Integer> mainIds      = readLockIds("getLocksByToken", token.getScriptHash());
        Set<Integer> lyingIds     = readLockIds("getLocksByToken", lyingToken.getScriptHash());
        Set<Integer> reentrantIds = readLockIds("getLocksByToken", reentrantToken.getScriptHash());

        assertThat(mainIds).doesNotContainAnyElementsOf(lyingIds);
        assertThat(mainIds).doesNotContainAnyElementsOf(reentrantIds);
        assertThat(lyingIds).doesNotContainAnyElementsOf(reentrantIds);

        BigInteger total = BigInteger.valueOf(mainIds.size() + lyingIds.size() + reentrantIds.size());
        assertThat(total).isEqualTo(lockCount());
    }

    // ============================================================
    // Helpers
    // ============================================================

    private void mintLyingTokens(BigInteger amount) throws Throwable {
        Hash256 tx = lyingToken.invokeFunction("mint",
                        hash160(depositor.getScriptHash()),
                        integer(amount))
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(tx, neow3j);
    }

    private void mintReentrantTokens(BigInteger amount) throws Throwable {
        Hash256 tx = reentrantToken.invokeFunction("mint",
                        hash160(depositor.getScriptHash()),
                        integer(amount))
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(tx, neow3j);
    }

    /** Submit a deposit (NEP-17 transfer with vault as receiver). */
    private Hash256 transferToVault(BigInteger amount, ContractParameter data) throws Throwable {
        return token.invokeFunction("transfer",
                        hash160(depositor.getScriptHash()),
                        hash160(vault.getScriptHash()),
                        integer(amount),
                        data)
                .signers(AccountSigner.calledByEntry(depositor))
                .sign().send().getSendRawTransaction().getHash();
    }

    /** Convenience for tests that only care about specific overrides. */
    private ContractParameter defaultLockData(int scheduleType, long start, long end, long cliff,
                                              ContractParameter tranches) {
        return lockData(beneficiary.getScriptHash(), scheduleType, start, end, cliff, tranches,
                "team", "default", false);
    }

    /** Build the 9-element data payload that {@code onPayment} expects. */
    private ContractParameter lockData(Hash160 ben, int scheduleType, long start, long end, long cliff,
                                       ContractParameter tranches,
                                       String category, String note, boolean revocable) {
        return array(
                hash160(ben),
                integer(scheduleType),
                integer(BigInteger.valueOf(start)),
                integer(BigInteger.valueOf(end)),
                integer(BigInteger.valueOf(cliff)),
                tranches != null ? tranches : any(null),
                string(category),
                string(note),
                bool(revocable));
    }

    /**
     * Create a lock for the default {@link #beneficiary}. Asserts that the
     * lockCount went up by exactly 1, returns the new lockId.
     */
    private int createLock(BigInteger amount, int scheduleType, long startSec, long endSec, long cliffSec,
                           ContractParameter tranches, String category, String note, boolean revocable)
            throws Throwable {
        return createLockForBeneficiary(beneficiary, amount, scheduleType, startSec, endSec, cliffSec,
                tranches, category, note, revocable);
    }

    private int createLockForBeneficiary(Account ben, BigInteger amount, int scheduleType,
                                         long startSec, long endSec, long cliffSec,
                                         ContractParameter tranches, String category, String note, boolean revocable)
            throws Throwable {
        ContractParameter data = lockData(ben.getScriptHash(), scheduleType, startSec, endSec, cliffSec,
                tranches, category, note, revocable);

        BigInteger countBefore = lockCount();

        Hash256 tx = transferToVault(amount, data);
        Await.waitUntilTransactionIsExecuted(tx, neow3j);

        BigInteger countAfter = lockCount();
        assertThat(countAfter).isEqualTo(countBefore.add(BigInteger.ONE));
        return countAfter.intValue();
    }

    /** Sign and send a vault function call as the test beneficiary. */
    private void invokeAsBeneficiary(String method, ContractParameter... params) throws Throwable {
        Hash256 tx = vault.invokeFunction(method, params)
                .signers(AccountSigner.calledByEntry(beneficiary))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(tx, neow3j);
    }

    /**
     * Read the lockId set produced by one of the {@code getLocksBy*} iterator
     * methods. Neo RPC returns iterators as a session-iterator handle
     * (InteropInterface stack item) which we traverse via RPC, terminating
     * the session afterwards.
     */
    private Set<Integer> readLockIds(String method, Hash160 subject) throws Throwable {
        NeoInvokeFunction r = vault.callInvokeFunction(method, Arrays.asList(hash160(subject)));
        String sessionId = r.getInvocationResult().getSessionId();
        StackItem item = r.getInvocationResult().getStack().get(0);

        Set<Integer> out = new HashSet<>();
        if (sessionId != null) {
            String iteratorId = item.getIteratorId();
            // RPC caps `count` per call (neo-express default ~100); 100 is plenty
            // for any test we run here. If we ever exceed it, paginate.
            List<StackItem> items = neow3j.traverseIterator(sessionId, iteratorId, 100).send()
                    .getTraverseIterator();
            for (StackItem el : items) {
                out.add(el.getInteger().intValue());
            }
            neow3j.terminateSession(sessionId).send();
        }
        return out;
    }

    private BigInteger vestedAmount(int lockId) throws Throwable {
        return vault.callInvokeFunction("vestedAmount", Arrays.asList(integer(lockId)))
                .getInvocationResult().getStack().get(0).getInteger();
    }

    private BigInteger claimableAmount(int lockId) throws Throwable {
        return vault.callInvokeFunction("claimableAmount", Arrays.asList(integer(lockId)))
                .getInvocationResult().getStack().get(0).getInteger();
    }

    private BigInteger lockCount() throws Throwable {
        return vault.callInvokeFunction("getLockCount")
                .getInvocationResult().getStack().get(0).getInteger();
    }

    private BigInteger totalLockedForToken() throws Throwable {
        return vault.callInvokeFunction("totalLocked", Arrays.asList(hash160(token.getScriptHash())))
                .getInvocationResult().getStack().get(0).getInteger();
    }

    private BigInteger balanceOf(Hash160 account) throws Throwable {
        return token.callInvokeFunction("balanceOf", Arrays.asList(hash160(account)))
                .getInvocationResult().getStack().get(0).getInteger();
    }

    /**
     * Build a stepped-tranches ByteString by invoking the test token's
     * {@code serializeArray} helper, which calls {@code StdLib.serialize}
     * on-chain and returns the bytes — guaranteed format-compatible with
     * the vault's deserialize path.
     */
    private ContractParameter buildTranchesBlob(long[] timestamps, BigInteger[] amounts) throws Throwable {
        ContractParameter[] pairs = new ContractParameter[timestamps.length];
        for (int i = 0; i < timestamps.length; i++) {
            pairs[i] = array(integer(BigInteger.valueOf(timestamps[i])), integer(amounts[i]));
        }
        ContractParameter wrapped = array((Object[]) pairs);
        NeoInvokeFunction r = token.callInvokeFunction("serializeArray", Arrays.asList(wrapped));
        byte[] bytes = r.getInvocationResult().getStack().get(0).getByteArray();
        return byteArray(bytes);
    }

    private long futureTime(long secondsFromNow) throws Throwable {
        return chainTimeSec() + secondsFromNow;
    }

    /** Latest block timestamp, in seconds. */
    private long chainTimeSec() throws Throwable {
        BigInteger blockIdx = neow3j.getBlockCount().send().getBlockCount().subtract(BigInteger.ONE);
        long ms = neow3j.getBlock(blockIdx, false).send().getBlock().getTime();
        return ms / 1000;
    }

    private static String repeat(char c, int n) {
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) sb.append(c);
        return sb.toString();
    }
}
