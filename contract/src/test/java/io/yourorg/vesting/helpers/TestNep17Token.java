package io.yourorg.vesting.helpers;

import io.neow3j.devpack.Hash160;
import io.neow3j.devpack.Runtime;
import io.neow3j.devpack.Storage;
import io.neow3j.devpack.StorageContext;
import io.neow3j.devpack.StorageMap;
import io.neow3j.devpack.annotations.DisplayName;
import io.neow3j.devpack.annotations.Safe;
import io.neow3j.devpack.contracts.ContractManagement;

/**
 * Minimal NEP-17 token used only by the contract test suite. SCAFFOLD —
 * intentionally tiny: implements just enough to drive {@code transfer} into
 * {@code VestingVault.onPayment} during tests.
 *
 * <p>Not deployed to any production network, not part of the main artifact.
 */
@DisplayName("TestNep17Token")
public class TestNep17Token {

    private static final StorageContext ctx = Storage.getStorageContext();
    private static final StorageMap balances = new StorageMap(ctx, new byte[]{0x10});
    private static final byte[] TOTAL_KEY = new byte[]{0x11};
    private static final byte[] OWNER_KEY = new byte[]{0x12};

    @Safe public static String symbol()    { return "TST"; }
    @Safe public static int    decimals()  { return 8; }

    @Safe public static int totalSupply() {
        var v = Storage.get(ctx, TOTAL_KEY);
        return v == null ? 0 : v.toInt();
    }

    @Safe public static int balanceOf(Hash160 account) {
        var v = balances.get(account.toByteString());
        return v == null ? 0 : v.toInt();
    }

    public static boolean transfer(Hash160 from, Hash160 to, int amount, Object data) {
        // TODO(scaffold): full NEP-17 transfer with witness check, balance update, and
        // post-transfer callback into the receiving contract via Contract.call when `to`
        // is a contract.
        Runtime.notify("Transfer", from, to, amount);
        return true;
    }

    public static void mint(Hash160 to, int amount) {
        // TODO(scaffold): test-only mint helper. Restrict to a deploy-time owner.
    }

    @SuppressWarnings("unused")
    private static boolean isContract(Hash160 h) {
        return ContractManagement.getContract(h) != null;
    }
}
