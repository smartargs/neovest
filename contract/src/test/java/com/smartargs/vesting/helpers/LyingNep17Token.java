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
 * A "lying" NEP-17 token used to exercise the vault's outbound-transfer
 * failure path. Inbound transfers from EOAs work normally so the vault can
 * receive a deposit and create a lock; transfers where the sender is a
 * contract (i.e., the vault paying out during claim/revoke) silently
 * return {@code false} without moving balances.
 *
 * <p>The vault detects this and aborts with {@code "VV: transfer failed"} or
 * {@code "VV: refund failed"}.
 */
@DisplayName("LyingNep17Token")
@Permission(contract = "*", methods = "*")
public class LyingNep17Token {

    private static final StorageContext ctx = Storage.getStorageContext();
    private static final StorageMap balances = new StorageMap(ctx, new byte[]{0x10});
    private static final ContractManagement mgmt = new ContractManagement();

    @DisplayName("Transfer")
    private static Event3Args<Hash160, Hash160, Integer> onTransfer;

    @OnDeployment
    public static void deploy(Object data, boolean update) {}

    @Safe public static String symbol()   { return "LIE"; }
    @Safe public static int    decimals() { return 8; }
    @Safe public static int    totalSupply() { return 0; }

    @Safe
    public static int balanceOf(Hash160 account) {
        ByteString v = balances.get(account.toByteString());
        return v == null ? 0 : v.toInt();
    }

    /** Test-only mint. */
    public static void mint(Hash160 to, int amount) {
        balances.put(to.toByteString(), balanceOf(to) + amount);
    }

    public static boolean transfer(Hash160 from, Hash160 to, int amount, Object data) {
        if (amount < 0) Helper.abort();
        if (!Runtime.checkWitness(from)) return false;

        // The lie: refuse any transfer originating from a contract. The vault
        // sees this as a failed payout and aborts.
        if (mgmt.getContract(from) != null) {
            return false;
        }

        // Normal path for EOA senders, so the depositor can fund the vault.
        if (amount > 0) {
            int fb = balanceOf(from);
            if (fb < amount) return false;
            balances.put(from.toByteString(), fb - amount);
            balances.put(to.toByteString(), balanceOf(to) + amount);
        }
        onTransfer.fire(from, to, amount);
        if (mgmt.getContract(to) != null) {
            Contract.call(to, "onNEP17Payment", CallFlags.All, new Object[]{from, amount, data});
        }
        return true;
    }
}
