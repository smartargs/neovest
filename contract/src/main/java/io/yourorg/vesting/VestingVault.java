package io.yourorg.vesting;

import io.neow3j.devpack.ByteString;
import io.neow3j.devpack.Contract;
import io.neow3j.devpack.Hash160;
import io.neow3j.devpack.Iterator;
import io.neow3j.devpack.Runtime;
import io.neow3j.devpack.StdLib;
import io.neow3j.devpack.Storage;
import io.neow3j.devpack.StorageContext;
import io.neow3j.devpack.StorageMap;
import io.neow3j.devpack.annotations.DisplayName;
import io.neow3j.devpack.annotations.OnNEP17Payment;
import io.neow3j.devpack.annotations.Permission;
import io.neow3j.devpack.annotations.Safe;
import io.neow3j.devpack.contracts.ContractManagement;
import io.neow3j.devpack.events.Event3Args;
import io.neow3j.devpack.events.Event8Args;

/**
 * VestingVault — a trustless NEP-17 token vesting contract for Neo N3.
 *
 * <p>NOTE: This is a SCAFFOLD. The methods here describe the intended public
 * surface and storage layout per VESTING_PROJECT_PLAN.md §3 but are not yet
 * fully implemented. They will not compile against the neow3j-devpack until
 * the bodies are filled in. See the plan for the exact validation rules,
 * schedule math, and event semantics that must be implemented.
 *
 * <p>The contract is intentionally immutable: no {@code _deploy}, no
 * {@code update}, no {@code destroy}, and no privileged role anywhere. Every
 * write either originates from a NEP-17 callback (which creates a lock) or
 * from a beneficiary calling {@link #claim} or a depositor calling
 * {@link #revoke} on a lock they themselves created.
 */
@Permission(contract = "*", methods = "*")
@DisplayName("VestingVault")
public class VestingVault {

    // ---- Storage ----

    private static final StorageContext ctx = Storage.getStorageContext();

    private static final byte[] PREFIX_COUNTER       = new byte[]{0x01};
    private static final byte[] PREFIX_LOCKS         = new byte[]{0x02};
    private static final byte[] PREFIX_BY_BEN        = new byte[]{0x03};
    private static final byte[] PREFIX_BY_DEP        = new byte[]{0x04};
    private static final byte[] PREFIX_BY_TOKEN      = new byte[]{0x05};
    private static final byte[] PREFIX_TOTAL_LOCKED  = new byte[]{0x06};

    private static final StorageMap locksMap         = new StorageMap(ctx, PREFIX_LOCKS);
    private static final StorageMap byBeneficiaryMap = new StorageMap(ctx, PREFIX_BY_BEN);
    private static final StorageMap byDepositorMap   = new StorageMap(ctx, PREFIX_BY_DEP);
    private static final StorageMap byTokenMap       = new StorageMap(ctx, PREFIX_BY_TOKEN);
    private static final StorageMap totalLockedMap   = new StorageMap(ctx, PREFIX_TOTAL_LOCKED);

    // ---- Events ----

    @DisplayName("LockCreated")
    private static Event8Args<Integer, Hash160, Hash160, Hash160, Integer, Byte, Integer, String> onLockCreated;

    @DisplayName("Claimed")
    private static Event3Args<Integer, Hash160, Integer> onClaimed;

    @DisplayName("Revoked")
    private static Event3Args<Integer, Hash160, Integer> onRevoked;

    // ---- Write methods ----

    /**
     * NEP-17 push callback: a token contract calls this when a holder transfers
     * tokens to the vault. The transferred tokens become the locked amount and
     * {@code data} is decoded as the lock parameters.
     *
     * <p>On any validation failure, {@link Runtime#abort} reverts the entire
     * transfer so the depositor's tokens stay with them.
     */
    @OnNEP17Payment
    public static void onPayment(Hash160 from, int amount, Object data) {
        // TODO(scaffold): decode data as Object[] per plan §3.2
        // TODO(scaffold): validate per plan §3.8 — abort() on failure
        // TODO(scaffold): allocate next lockId, build Lock, serialize into locksMap
        // TODO(scaffold): write existence flags to byBeneficiaryMap, byDepositorMap, byTokenMap
        // TODO(scaffold): increment totalLockedMap[token]
        // TODO(scaffold): fire onLockCreated
        Runtime.notify("onPayment_scaffold", from, amount);
    }

    /**
     * Beneficiary withdraws their currently-vested-but-unclaimed amount.
     *
     * @return the amount transferred this call
     */
    @DisplayName("claim")
    public static int claim(int lockId) {
        // TODO(scaffold): load Lock, require Runtime.checkWitness(lock.beneficiary)
        // TODO(scaffold): compute (vested - claimed), update claimedAmount, persist
        // TODO(scaffold): Contract.call(lock.token, "transfer", ...) to send tokens
        // TODO(scaffold): fire onClaimed
        return 0;
    }

    /**
     * Depositor revokes the unvested portion of a revocable lock. The
     * beneficiary keeps the right to claim already-vested tokens.
     */
    @DisplayName("revoke")
    public static void revoke(int lockId) {
        // TODO(scaffold): load Lock, require revocable && !revoked
        // TODO(scaffold): require Runtime.checkWitness(lock.depositor)
        // TODO(scaffold): compute returnAmount = totalAmount - vestedAmount
        // TODO(scaffold): mark revoked, transfer returnAmount back to depositor
        // TODO(scaffold): fire onRevoked
    }

    // ---- Read methods ----

    @DisplayName("getLock")
    @Safe
    public static Lock getLock(int lockId) {
        ByteString raw = locksMap.get(lockId);
        if (raw == null) return null;
        return (Lock) StdLib.deserialize(raw);
    }

    @DisplayName("getLockCount")
    @Safe
    public static int getLockCount() {
        ByteString v = Storage.get(ctx, PREFIX_COUNTER);
        return v == null ? 0 : v.toInt();
    }

    @DisplayName("vestedAmount")
    @Safe
    public static int vestedAmount(int lockId) {
        // TODO(scaffold): per plan §3.4 schedule math
        return 0;
    }

    @DisplayName("claimableAmount")
    @Safe
    public static int claimableAmount(int lockId) {
        // TODO(scaffold): vestedAmount - lock.claimedAmount, clamped to >= 0
        return 0;
    }

    @DisplayName("getLocksByBeneficiary")
    @Safe
    public static Iterator<ByteString> getLocksByBeneficiary(Hash160 beneficiary) {
        return (Iterator<ByteString>) Storage.find(ctx, byBeneficiaryMap.toByteArray(),
                io.neow3j.devpack.constants.FindOptions.KeysOnly);
    }

    @DisplayName("getLocksByDepositor")
    @Safe
    public static Iterator<ByteString> getLocksByDepositor(Hash160 depositor) {
        return (Iterator<ByteString>) Storage.find(ctx, byDepositorMap.toByteArray(),
                io.neow3j.devpack.constants.FindOptions.KeysOnly);
    }

    @DisplayName("getLocksByToken")
    @Safe
    public static Iterator<ByteString> getLocksByToken(Hash160 token) {
        return (Iterator<ByteString>) Storage.find(ctx, byTokenMap.toByteArray(),
                io.neow3j.devpack.constants.FindOptions.KeysOnly);
    }

    @DisplayName("totalLocked")
    @Safe
    public static int totalLocked(Hash160 token) {
        ByteString v = totalLockedMap.get(token.toByteString());
        return v == null ? 0 : v.toInt();
    }

    // ---- Helpers (kept private to discourage external use) ----

    @SuppressWarnings("unused")
    private static int now() {
        // Runtime.getTime() returns milliseconds; vesting math uses seconds.
        return Runtime.getTime() / 1000;
    }

    @SuppressWarnings("unused")
    private static void assertOrAbort(boolean cond) {
        if (!cond) Runtime.abort();
    }

    @SuppressWarnings("unused")
    private static Contract self() {
        return ContractManagement.getContract(Runtime.getExecutingScriptHash());
    }
}
