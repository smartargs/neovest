package com.smartargs.vesting.helpers;

import io.neow3j.contract.GasToken;
import io.neow3j.contract.SmartContract;
import io.neow3j.protocol.Neow3j;
import io.neow3j.protocol.core.response.NeoApplicationLog;
import io.neow3j.test.ContractTestExtension;
import io.neow3j.transaction.AccountSigner;
import io.neow3j.transaction.Transaction;
import io.neow3j.transaction.TransactionBuilder;
import io.neow3j.types.Hash160;
import io.neow3j.types.Hash256;
import io.neow3j.types.NeoVMStateType;
import io.neow3j.utils.Await;
import io.neow3j.wallet.Account;

import java.io.IOException;
import java.math.BigInteger;

import static io.neow3j.types.ContractParameter.hash160;
import static io.neow3j.types.ContractParameter.integer;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Test-only utilities shared across the vesting suite.
 *
 * <p>Two responsibilities:
 * <ul>
 *   <li>{@link #assertAborted}: assert that a (FAULTed) transaction failed
 *       with a specific {@code Helper.abort("VV: …")} message — read from
 *       the application log, not from a thrown Java exception.</li>
 *   <li>{@link #fundWithGas} / {@link #mintTokens}: shared chain-setup
 *       boilerplate so test classes don't have to reinvent the genesis
 *       multi-sig signing dance for every {@code @BeforeAll}.</li>
 * </ul>
 */
public final class TestHelper {

    private TestHelper() {}

    /**
     * Wait for the (FAULTed) transaction to be included, then assert the VM
     * state and that the fault message contains {@code expectedMessage}.
     *
     * <p>Requires the calling test to have enabled
     * {@code neow3j.allowTransmissionOnFault()} during setup so the FAULT
     * doesn't get rejected before mining.
     */
    public static void assertAborted(Hash256 tx, String expectedMessage, Neow3j neow3j) throws IOException {
        Await.waitUntilTransactionIsExecuted(tx, neow3j);
        NeoApplicationLog.Execution exec = neow3j.getApplicationLog(tx).send()
                .getApplicationLog().getExecutions().get(0);
        assertThat(exec.getState())
                .as("expected tx to FAULT but state was %s", exec.getState())
                .isEqualTo(NeoVMStateType.FAULT);
        String exception = exec.getException();
        assertThat(exception)
                .as("expected fault message containing '%s'", expectedMessage)
                .isNotNull()
                .contains(expectedMessage);
    }

    /**
     * Send {@code amount} of GAS from the genesis multi-sig to {@code to}.
     * Mirrors the test extension's own deploy signing: build the unsigned
     * transaction, then attach a multi-sig witness assembled from the
     * genesis signer keys.
     */
    public static void fundWithGas(Neow3j neow3j, ContractTestExtension ext, Hash160 to, BigInteger amount)
            throws Throwable {
        ContractTestExtension.GenesisAccount genesis = ext.getGenesisAccount();
        Account multiSig = genesis.getMultiSigAccount();
        Account[] signers = genesis.getSignerAccounts();

        GasToken gas = new GasToken(neow3j);
        TransactionBuilder b = gas.transfer(multiSig, to, amount)
                .signers(AccountSigner.calledByEntry(multiSig));
        Transaction tx = b.getUnsignedTransaction()
                .addMultiSigWitness(multiSig.getVerificationScript(), signers);
        Hash256 hash = tx.send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(hash, neow3j);
    }

    /**
     * Mint {@code amount} of the test token to {@code to}, signed by
     * {@code signer}. The TestNep17Token's {@code mint} is unwitnessed
     * (test-only convenience), so any funded account can sign.
     */
    public static void mintTokens(SmartContract token, Account signer, Hash160 to, BigInteger amount, Neow3j neow3j)
            throws Throwable {
        Hash256 tx = token.invokeFunction("mint", hash160(to), integer(amount))
                .signers(AccountSigner.calledByEntry(signer))
                .sign().send().getSendRawTransaction().getHash();
        Await.waitUntilTransactionIsExecuted(tx, neow3j);
    }
}
