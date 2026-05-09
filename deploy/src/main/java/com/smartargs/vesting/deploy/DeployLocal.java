package com.smartargs.vesting.deploy;

/**
 * Local-network counterpart to {@link Deploy}. Targets a running
 * {@code neo-express} instance for end-to-end smoke testing before mainnet.
 *
 * <p>Defaults (override via env vars):
 * <ul>
 *   <li>{@code NEO_RPC} → {@code http://localhost:50012}</li>
 *   <li>{@code DEPLOYER_WIF} → the canonical {@code neo-express} default
 *       genesis account WIF (publicly known, used only on local chains).</li>
 * </ul>
 */
public final class DeployLocal {

    private static final String DEFAULT_RPC = "http://localhost:50012";
    /** Public, well-known neo-express default genesis WIF. Local use only. */
    private static final String DEFAULT_LOCAL_WIF = "KxDgvEKzgSBPPfuVfw67oPQBSjidEiqTHURKSDL1R7yGaGYAeYnr";

    public static void main(String[] args) throws Throwable {
        String rpcUrl = System.getenv().getOrDefault("NEO_RPC", DEFAULT_RPC);
        String wif    = System.getenv().getOrDefault("DEPLOYER_WIF", DEFAULT_LOCAL_WIF);
        // VAULT_OWNER is optional locally — defaults to the local deployer.
        String owner  = System.getenv("VAULT_OWNER");
        Deploy.run(rpcUrl, wif, owner);
    }

    private DeployLocal() {}
}
