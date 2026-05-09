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
 * A re-entrant NEP-17 token used to exercise {@code VestingVault.guardReentry()}.
 *
 * <p>When called from a contract (i.e., during the vault's outbound transfer
 * inside {@code claim}/{@code revoke}), this token's {@code transfer}
 * re-enters the calling contract's {@code claim} method using the lockId
 * stored under {@code KEY_TARGET}.
 *
 * <p>The vault's re-entrancy guard fires on the nested call (invocation
 * counter > 1) and aborts with {@code "VV: re-entry"} — which propagates up
 * through the {@code Contract.call} chain and faults the entire transaction.
 */
@DisplayName("ReentrantNep17Token")
@Permission(contract = "*", methods = "*")
public class ReentrantNep17Token {

    private static final StorageContext ctx = Storage.getStorageContext();
    private static final StorageMap balances = new StorageMap(ctx, new byte[]{0x10});
    private static final byte[] KEY_TARGET = new byte[]{0x12};
    private static final ContractManagement mgmt = new ContractManagement();

    @DisplayName("Transfer")
    private static Event3Args<Hash160, Hash160, Integer> onTransfer;

    @OnDeployment
    public static void deploy(Object data, boolean update) {}

    @Safe public static String symbol()   { return "RTK"; }
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

    /**
     * Arm the re-entrancy attack: the next contract-originated {@code transfer}
     * will call back into {@code from.claim(lockId)}. Set to 0 to disarm.
     */
    public static void setReentryTarget(int lockId) {
        Storage.put(ctx, KEY_TARGET, lockId);
    }

    public static boolean transfer(Hash160 from, Hash160 to, int amount, Object data) {
        if (amount < 0) Helper.abort();
        if (!Runtime.checkWitness(from)) return false;

        // Move balances normally — we want the deposit/payout to look real
        // up to the moment we re-enter.
        if (amount > 0) {
            int fb = balanceOf(from);
            if (fb < amount) return false;
            balances.put(from.toByteString(), fb - amount);
            balances.put(to.toByteString(), balanceOf(to) + amount);
        }
        onTransfer.fire(from, to, amount);

        // Standard NEP-17 callback for inbound-to-contract.
        if (mgmt.getContract(to) != null) {
            Contract.call(to, "onNEP17Payment", CallFlags.All, new Object[]{from, amount, data});
        }

        // ATTACK: when the sender is a contract (the vault paying out), re-enter
        // its claim() on the armed target. The vault's guard catches this.
        if (mgmt.getContract(from) != null) {
            ByteString rawTarget = Storage.get(ctx, KEY_TARGET);
            if (rawTarget != null && rawTarget.toInt() != 0) {
                Contract.call(from, "claim", CallFlags.All, new Object[]{rawTarget.toInt()});
            }
        }
        return true;
    }
}
