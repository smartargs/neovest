package com.smartargs.vesting.helpers;

import io.neow3j.devpack.Contract;
import io.neow3j.devpack.Hash160;
import io.neow3j.devpack.annotations.DisplayName;
import io.neow3j.devpack.annotations.OnDeployment;
import io.neow3j.devpack.annotations.Permission;
import io.neow3j.devpack.annotations.Safe;
import io.neow3j.devpack.constants.CallFlags;

/**
 * A contract that pretends to be a NEP-17 token and calls the vault's
 * {@code onNEP17Payment} directly, claiming that the owner deposited tokens
 * that were never transferred. Its {@code transfer} always reports success
 * so a lock created this way would even look claimable.
 *
 * <p>The vault must reject the call because the owner never witnessed it.
 */
@DisplayName("SpoofingNep17Token")
@Permission(contract = "*", methods = "*")
public class SpoofingNep17Token {

    @OnDeployment
    public static void deploy(Object data, boolean update) {}

    @Safe public static String symbol()   { return "HYPR"; }
    @Safe public static int    decimals() { return 8; }
    @Safe public static int    totalSupply() { return 0; }

    @Safe
    public static int balanceOf(Hash160 account) {
        return 0;
    }

    public static boolean transfer(Hash160 from, Hash160 to, int amount, Object data) {
        return true;
    }

    public static void spoofDeposit(Hash160 vault, Hash160 from, int amount, Object data) {
        Contract.call(vault, "onNEP17Payment", CallFlags.All, new Object[]{from, amount, data});
    }
}
