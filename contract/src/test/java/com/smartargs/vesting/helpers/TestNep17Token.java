package com.smartargs.vesting.helpers;

import io.neow3j.devpack.ByteString;
import io.neow3j.devpack.Contract;
import io.neow3j.devpack.Hash160;
import io.neow3j.devpack.Helper;
import io.neow3j.devpack.Runtime;
import io.neow3j.devpack.Storage;
import io.neow3j.devpack.StorageContext;
import io.neow3j.devpack.StorageMap;
import io.neow3j.devpack.annotations.DisplayName;
import io.neow3j.devpack.annotations.OnDeployment;
import io.neow3j.devpack.annotations.Permission;
import io.neow3j.devpack.annotations.Safe;
import io.neow3j.devpack.constants.CallFlags;
import io.neow3j.devpack.contracts.ContractManagement;
import io.neow3j.devpack.events.Event3Args;

/**
 * Minimal NEP-17 token used only in the contract test suite.
 *
 * <p>Just enough of the NEP-17 standard to exercise the vault: balanceOf,
 * transfer (with witness check + post-transfer onPayment callback when the
 * receiver is a contract), totalSupply, symbol, decimals, and a test-only
 * {@code mint} helper.
 *
 * <p>Not deployed to any production network. Lives here purely as a counterparty
 * for {@link com.smartargs.vesting.VestingVault} during JUnit runs.
 */
@DisplayName("TestNep17Token")
@Permission(contract = "*", methods = "*")
public class TestNep17Token {

    private static final StorageContext ctx = Storage.getStorageContext();

    private static final byte[] PREFIX_BALANCES = new byte[]{0x10};
    private static final byte[] KEY_TOTAL       = new byte[]{0x11};

    private static final StorageMap balances = new StorageMap(ctx, PREFIX_BALANCES);

    private static final ContractManagement mgmt = new ContractManagement();

    @DisplayName("Transfer")
    private static Event3Args<Hash160, Hash160, Integer> onTransfer;

    @OnDeployment
    public static void deploy(Object data, boolean update) {
        // No-op. Initial supply is minted via mint() from tests.
    }

    @Safe public static String symbol()   { return "TST"; }
    @Safe public static int    decimals() { return 8; }

    @Safe
    public static int totalSupply() {
        ByteString v = Storage.get(ctx, KEY_TOTAL);
        return v == null ? 0 : v.toInt();
    }

    @Safe
    public static int balanceOf(Hash160 account) {
        if (account == null || !Hash160.isValid(account)) Helper.abort();
        ByteString v = balances.get(account.toByteString());
        return v == null ? 0 : v.toInt();
    }

    public static boolean transfer(Hash160 from, Hash160 to, int amount, Object data) {
        if (amount < 0) Helper.abort();
        if (from == null || to == null) Helper.abort();
        if (!Hash160.isValid(from) || !Hash160.isValid(to)) Helper.abort();

        // Witness — only the holder (or a contract calling out as itself) can move tokens.
        if (!Runtime.checkWitness(from)) return false;

        if (amount > 0) {
            int fromBal = balanceInternal(from);
            if (fromBal < amount) return false;

            if (from.equals(to)) {
                // Self-transfer: balances are unchanged but we still fire the event
                // and call onNEP17Payment on contracts (NEP-17 spec).
            } else {
                if (fromBal == amount) {
                    balances.delete(from.toByteString());
                } else {
                    balances.put(from.toByteString(), fromBal - amount);
                }
                int toBal = balanceInternal(to);
                balances.put(to.toByteString(), toBal + amount);
            }
        }

        onTransfer.fire(from, to, amount);

        // Post-transfer callback into the receiver if it's a contract.
        if (mgmt.getContract(to) != null) {
            Contract.call(to, "onNEP17Payment", CallFlags.All, new Object[]{from, amount, data});
        }

        return true;
    }

    /**
     * Test-only mint. Production tokens would never expose this without an
     * owner check. Used by the test setup to fund the depositor.
     */
    public static void mint(Hash160 to, int amount) {
        if (amount <= 0) Helper.abort();
        if (to == null || !Hash160.isValid(to)) Helper.abort();

        int toBal = balanceInternal(to);
        balances.put(to.toByteString(), toBal + amount);

        ByteString totalRaw = Storage.get(ctx, KEY_TOTAL);
        int prev = totalRaw == null ? 0 : totalRaw.toInt();
        Storage.put(ctx, KEY_TOTAL, prev + amount);

        onTransfer.fire(Hash160.zero(), to, amount);
    }

    private static int balanceInternal(Hash160 account) {
        ByteString v = balances.get(account.toByteString());
        return v == null ? 0 : v.toInt();
    }
}
