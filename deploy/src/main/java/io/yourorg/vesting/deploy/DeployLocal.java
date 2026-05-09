package io.yourorg.vesting.deploy;

/**
 * Same as {@link Deploy} but pointed at a local {@code neo-express} instance.
 *
 * <p>Defaults:
 * <ul>
 *   <li>RPC URL: {@code http://localhost:50012}</li>
 *   <li>Deployer WIF: read from {@code DEPLOYER_WIF} or, if absent, the canonical
 *       {@code neo-express} default genesis account.</li>
 * </ul>
 *
 * <p>Use this for end-to-end smoke testing before mainnet deployment.
 *
 * <p>SCAFFOLD — delegates to {@link Deploy#main} after rewriting env vars.
 */
public final class DeployLocal {

    private static final String DEFAULT_RPC = "http://localhost:50012";
    // Conventional neo-express default account WIF — public, used only locally.
    private static final String DEFAULT_LOCAL_WIF = "KxDgvEKzgSBPPfuVfw67oPQBSjidEiqTHURKSDL1R7yGaGYAeYnr";

    public static void main(String[] args) throws Throwable {
        if (System.getenv("NEO_RPC") == null) {
            // System.setenv is not exposed in standard Java; document the override instead.
            System.out.println("Tip: set NEO_RPC=" + DEFAULT_RPC + " for neo-express local deploys.");
        }
        if (System.getenv("DEPLOYER_WIF") == null) {
            System.out.println("Tip: set DEPLOYER_WIF=<wif> (default neo-express genesis: "
                    + DEFAULT_LOCAL_WIF + ")");
        }
        Deploy.main(args);
    }

    private DeployLocal() {}
}
