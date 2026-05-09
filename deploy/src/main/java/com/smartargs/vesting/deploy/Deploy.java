package com.smartargs.vesting.deploy;

import io.neow3j.contract.ContractManagement;
import io.neow3j.contract.NefFile;
import io.neow3j.contract.SmartContract;
import io.neow3j.protocol.Neow3j;
import io.neow3j.protocol.core.response.NeoApplicationLog;
import io.neow3j.protocol.core.response.NeoSendRawTransaction;
import io.neow3j.protocol.http.HttpService;
import io.neow3j.transaction.AccountSigner;
import io.neow3j.transaction.Transaction;
import io.neow3j.types.Hash160;
import io.neow3j.types.Hash256;
import io.neow3j.types.NeoVMStateType;
import io.neow3j.utils.Await;
import io.neow3j.wallet.Account;
import io.neow3j.protocol.ObjectMapperFactory;
import io.neow3j.protocol.core.response.ContractManifest;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Deploy {@code VestingVault} to a public Neo N3 network.
 *
 * <p>Reads:
 * <ul>
 *   <li>{@code NEO_RPC} — RPC endpoint URL. Defaults to {@code https://mainnet1.neo.coz.io:443}.</li>
 *   <li>{@code DEPLOYER_WIF} — WIF-encoded private key of the funded deployer account.
 *       <strong>Never commit this.</strong></li>
 * </ul>
 *
 * <p>Inputs (must already exist; produced by {@code ./gradlew :contract:neow3jCompile}):
 * <ul>
 *   <li>{@code contract/build/neow3j/VestingVault.nef}</li>
 *   <li>{@code contract/build/neow3j/VestingVault.manifest.json}</li>
 * </ul>
 *
 * <p>Submits the deployment transaction, waits for inclusion via
 * {@link Await#waitUntilTransactionIsExecuted}, verifies the application log
 * didn't FAULT, then prints the deterministically-derived contract hash.
 */
public final class Deploy {

    public static void main(String[] args) throws Throwable {
        String rpcUrl = System.getenv().getOrDefault("NEO_RPC", "https://mainnet1.neo.coz.io:443");
        String wif = System.getenv("DEPLOYER_WIF");
        if (wif == null || wif.isBlank()) {
            System.err.println("DEPLOYER_WIF is required. Refusing to deploy without a key.");
            System.exit(2);
        }
        // VAULT_OWNER defaults to the deployer's address — the deployer
        // owns the vault unless someone explicitly hands ownership to a
        // separate (multi-sig) wallet via the env var.
        String ownerAddrOrHash = System.getenv("VAULT_OWNER");
        run(rpcUrl, wif, ownerAddrOrHash);
    }

    /**
     * Compile-product → on-chain deployment, with full receipt: tx hash,
     * application-log state check, deterministic contract-hash derivation.
     * Public so {@link DeployLocal} can call it with neo-express defaults.
     *
     * @param ownerAddrOrHash the address (N-prefixed) or scripthash (0x-hex)
     *                        that will own the vault. {@code null} means
     *                        "the deployer owns it".
     */
    public static Hash160 run(String rpcUrl, String wif, String ownerAddrOrHash) throws Throwable {
        Neow3j neow3j = Neow3j.build(new HttpService(rpcUrl));
        Account deployer = Account.fromWIF(wif);
        Hash160 owner = ownerAddrOrHash != null && !ownerAddrOrHash.isBlank()
                ? parseHash160(ownerAddrOrHash)
                : deployer.getScriptHash();
        System.out.println("Deployer: " + deployer.getAddress());
        System.out.println("Owner:    " + owner);
        System.out.println("RPC:      " + rpcUrl);

        Path nefPath = Paths.get("contract", "build", "neow3j", "VestingVault.nef");
        Path manifestPath = Paths.get("contract", "build", "neow3j", "VestingVault.manifest.json");
        if (!Files.exists(nefPath) || !Files.exists(manifestPath)) {
            System.err.println("Missing compiled artifacts. Run: ./gradlew :contract:neow3jCompile");
            System.exit(2);
        }

        NefFile nef = NefFile.readFromFile(nefPath.toFile());
        ContractManifest manifest = ObjectMapperFactory.getObjectMapper()
                .readValue(Files.readAllBytes(manifestPath), ContractManifest.class);

        ContractManagement mgmt = new ContractManagement(neow3j);
        Transaction tx = mgmt.deploy(nef, manifest, io.neow3j.types.ContractParameter.hash160(owner))
                .signers(AccountSigner.calledByEntry(deployer))
                .sign();

        NeoSendRawTransaction sent = tx.send();
        if (sent.hasError()) {
            throw new RuntimeException("Deploy send failed: " + sent.getError().getMessage());
        }
        Hash256 txHash = sent.getSendRawTransaction().getHash();
        System.out.println("Deploy tx: " + txHash);

        // Wait for inclusion in a block.
        Await.waitUntilTransactionIsExecuted(txHash, neow3j);

        // Verify it didn't FAULT.
        NeoApplicationLog.Execution exec = neow3j.getApplicationLog(txHash).send()
                .getApplicationLog().getExecutions().get(0);
        if (exec.getState() != NeoVMStateType.HALT) {
            throw new RuntimeException("Deploy reverted: " + exec.getException());
        }

        // The contract hash is deterministic: it's derived from the deployer's
        // script hash + the NEF checksum + the contract name. Computing it
        // locally avoids a second RPC round-trip.
        Hash160 contractHash = SmartContract.calcContractHash(
                deployer.getScriptHash(),
                nef.getCheckSumAsInteger(),
                manifest.getName());

        System.out.println("Contract: " + contractHash);
        System.out.println();
        System.out.println("Point the UI at: /v/" + contractHash);
        return contractHash;
    }

    /** Accept either {@code N…}-style addresses or {@code 0x…}-style scripthashes. */
    private static Hash160 parseHash160(String s) {
        s = s.trim();
        if (s.startsWith("0x") || s.startsWith("0X")) return new Hash160(s);
        // Treat anything else as a Neo3 address.
        return io.neow3j.wallet.Account.fromAddress(s).getScriptHash();
    }

    private Deploy() {}
}
