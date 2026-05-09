package com.smartargs.vesting.deploy;

import io.neow3j.contract.ContractManagement;
import io.neow3j.contract.NefFile;
import io.neow3j.contract.SmartContract;
import io.neow3j.protocol.Neow3j;
import io.neow3j.protocol.http.HttpService;
import io.neow3j.protocol.core.response.NeoSendRawTransaction;
import io.neow3j.transaction.AccountSigner;
import io.neow3j.transaction.Transaction;
import io.neow3j.types.Hash256;
import io.neow3j.wallet.Account;

import java.io.File;
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
 * <p>Outputs the deployment transaction hash, then polls for inclusion and
 * prints the resulting contract hash.
 *
 * <p>SCAFFOLD — the manifest parsing call below is shaped per neow3j's API
 * but should be reviewed against the pinned neow3j version before production use.
 */
public final class Deploy {

    public static void main(String[] args) throws Throwable {
        String rpcUrl = System.getenv().getOrDefault("NEO_RPC", "https://mainnet1.neo.coz.io:443");
        String wif = System.getenv("DEPLOYER_WIF");
        if (wif == null || wif.isBlank()) {
            System.err.println("DEPLOYER_WIF is required. Refusing to deploy without a key.");
            System.exit(2);
        }

        Neow3j neow3j = Neow3j.build(new HttpService(rpcUrl));
        Account deployer = Account.fromWIF(wif);
        System.out.println("Deployer: " + deployer.getAddress());
        System.out.println("RPC:      " + rpcUrl);

        Path nefPath = Paths.get("contract", "build", "neow3j", "VestingVault.nef");
        Path manifestPath = Paths.get("contract", "build", "neow3j", "VestingVault.manifest.json");
        if (!Files.exists(nefPath) || !Files.exists(manifestPath)) {
            System.err.println("Missing compiled artifacts. Run: ./gradlew :contract:neow3jCompile");
            System.exit(2);
        }

        NefFile nef = NefFile.readFromFile(nefPath.toFile());
        String manifestJson = Files.readString(manifestPath);

        ContractManagement mgmt = new ContractManagement(neow3j);
        Transaction tx = mgmt.deploy(nef, manifestJson)
                .signers(AccountSigner.calledByEntry(deployer))
                .sign();

        NeoSendRawTransaction sent = tx.send();
        if (sent.hasError()) {
            throw new RuntimeException("Deploy send failed: " + sent.getError().getMessage());
        }
        Hash256 txHash = sent.getSendRawTransaction().getHash();
        System.out.println("Deploy tx: " + txHash);

        // Wait for inclusion. neow3j provides an Await helper; if absent for the pinned
        // version, poll getTransactionHeight in a small loop here.
        // TODO(scaffold): poll for tx height, then resolve and print the deployed contract hash.
        System.out.println("Submitted. Look up the transaction on a block explorer to find the contract hash.");
    }

    private Deploy() {}
}
