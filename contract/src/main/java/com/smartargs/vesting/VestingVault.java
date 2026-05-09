package com.smartargs.vesting;

import io.neow3j.devpack.ByteString;
import io.neow3j.devpack.Contract;
import io.neow3j.devpack.Hash160;
import io.neow3j.devpack.Helper;
import io.neow3j.devpack.Iterator;
import io.neow3j.devpack.Runtime;
import io.neow3j.devpack.Storage;
import io.neow3j.devpack.StorageContext;
import io.neow3j.devpack.StorageMap;
import io.neow3j.devpack.annotations.DisplayName;
import io.neow3j.devpack.annotations.OnNEP17Payment;
import io.neow3j.devpack.annotations.Permission;
import io.neow3j.devpack.annotations.Safe;
import io.neow3j.devpack.constants.CallFlags;
import io.neow3j.devpack.constants.FindOptions;
import io.neow3j.devpack.contracts.StdLib;
import io.neow3j.devpack.events.Event3Args;
import io.neow3j.devpack.events.Event8Args;

/**
 * VestingVault — a trustless NEP-17 token vesting contract for Neo N3.
 *
 * <p>Immutable: no owner, no upgrade, no destroy. The only state mutations
 * possible are: a NEP-17 transfer to the vault (which creates a Lock via
 * {@link #onPayment}), {@link #claim} called by a beneficiary on their own
 * lock, and {@link #revoke} called by the depositor of a revocable lock.
 */
@DisplayName("VestingVault")
@Permission(contract = "*", methods = "*")
public class VestingVault {

    // ---- Storage prefixes ----

    private static final byte[] PREFIX_COUNTER       = new byte[]{0x01};
    private static final byte[] PREFIX_LOCKS         = new byte[]{0x02};
    private static final byte[] PREFIX_BY_BEN        = new byte[]{0x03};
    private static final byte[] PREFIX_BY_DEP        = new byte[]{0x04};
    private static final byte[] PREFIX_BY_TOKEN      = new byte[]{0x05};
    private static final byte[] PREFIX_TOTAL_LOCKED  = new byte[]{0x06};

    private static final StorageContext ctx = Storage.getStorageContext();
    private static final StorageMap locksMap       = new StorageMap(ctx, PREFIX_LOCKS);
    private static final StorageMap byBenMap       = new StorageMap(ctx, PREFIX_BY_BEN);
    private static final StorageMap byDepMap       = new StorageMap(ctx, PREFIX_BY_DEP);
    private static final StorageMap byTokenMap     = new StorageMap(ctx, PREFIX_BY_TOKEN);
    private static final StorageMap totalLockedMap = new StorageMap(ctx, PREFIX_TOTAL_LOCKED);

    // StdLib in neow3j 3.22 is instance-based (interop contract wrapper).
    // One singleton is fine; this field is effectively a typed handle.
    private static final StdLib stdLib = new StdLib();

    // ---- Schedule type codes ----

    private static final byte SCHED_CLIFF   = 0;
    private static final byte SCHED_LINEAR  = 1;
    private static final byte SCHED_STEPPED = 2;

    // ---- Events ----

    @DisplayName("LockCreated")
    private static Event8Args<Integer, Hash160, Hash160, Hash160, Integer, Integer, Integer, String> onLockCreated;

    @DisplayName("Claimed")
    private static Event3Args<Integer, Hash160, Integer> onClaimed;

    @DisplayName("Revoked")
    private static Event3Args<Integer, Hash160, Integer> onRevoked;

    // ---- Write methods ----

    /**
     * NEP-17 push callback. The token transfer is taken to be a deposit into
     * the vault; {@code data} is decoded as the lock parameters and a new
     * {@link Lock} is created. Any validation failure aborts the entire
     * transfer (the depositor's tokens stay with them).
     *
     * <p>Expected {@code data} shape (Object[9]):
     * <ol>
     *   <li>beneficiary: Hash160</li>
     *   <li>scheduleType: int (0=Cliff, 1=Linear, 2=Stepped)</li>
     *   <li>startTime: int (unix seconds)</li>
     *   <li>endTime: int (unix seconds)</li>
     *   <li>cliffTime: int (unix seconds, 0 if none)</li>
     *   <li>tranches: ByteString (serialized [(ts, amount), ...] for stepped; empty otherwise)</li>
     *   <li>category: String (≤ 32 chars)</li>
     *   <li>note: String (≤ 256 chars)</li>
     *   <li>revocable: boolean</li>
     * </ol>
     */
    @OnNEP17Payment
    public static void onPayment(Hash160 from, int amount, Object data) {
        if (amount <= 0) Helper.abort();

        Hash160 token = Runtime.getCallingScriptHash();
        if (token == null) Helper.abort();

        Object[] params = (Object[]) data;
        if (params.length != 9) Helper.abort();

        Hash160 beneficiary = (Hash160) params[0];
        if (beneficiary == null || beneficiary.isZero()) Helper.abort();

        int scheduleType = (int) params[1];
        int startTime    = (int) params[2];
        int endTime      = (int) params[3];
        int cliffTime    = (int) params[4];
        ByteString tranches = (ByteString) params[5];
        String category  = (String) params[6];
        String note      = (String) params[7];
        boolean revocable = (boolean) params[8];

        int now = Runtime.getTime() / 1000;

        if (category == null || category.length() > 32) Helper.abort();
        if (note == null) note = "";
        if (note.length() > 256) Helper.abort();

        if (scheduleType == SCHED_CLIFF) {
            if (startTime <= now) Helper.abort();
            endTime = startTime;
            cliffTime = 0;
        } else if (scheduleType == SCHED_LINEAR) {
            if (startTime >= endTime) Helper.abort();
            if (cliffTime != 0 && (cliffTime < startTime || cliffTime > endTime)) Helper.abort();
        } else if (scheduleType == SCHED_STEPPED) {
            if (tranches == null || tranches.length() == 0) Helper.abort();
            Object[] arr = (Object[]) stdLib.deserialize(tranches);
            if (arr.length < 1) Helper.abort();
            int sum = 0;
            int prevTs = -1;
            for (int i = 0; i < arr.length; i++) {
                Object[] pair = (Object[]) arr[i];
                int ts  = (int) pair[0];
                int amt = (int) pair[1];
                if (ts <= prevTs) Helper.abort();
                if (ts <= now) Helper.abort();
                if (amt <= 0) Helper.abort();
                sum += amt;
                prevTs = ts;
            }
            if (sum != amount) Helper.abort();
            // Derive start/end from first/last tranche timestamps
            startTime = (int) ((Object[]) arr[0])[0];
            endTime   = (int) ((Object[]) arr[arr.length - 1])[0];
            cliffTime = 0;
        } else {
            Helper.abort();
        }

        // Allocate next lockId
        ByteString counterRaw = Storage.get(ctx, PREFIX_COUNTER);
        int lockId = (counterRaw == null ? 0 : counterRaw.toInt()) + 1;
        Storage.put(ctx, PREFIX_COUNTER, lockId);

        // Build and persist the Lock
        Lock lock = new Lock();
        lock.lockId        = lockId;
        lock.depositor     = from;
        lock.beneficiary   = beneficiary;
        lock.token         = token;
        lock.totalAmount   = amount;
        lock.claimedAmount = 0;
        lock.scheduleType  = (byte) scheduleType;
        lock.startTime     = startTime;
        lock.endTime       = endTime;
        lock.cliffTime     = cliffTime;
        lock.tranches      = tranches == null ? new ByteString("") : tranches;
        lock.category      = category;
        lock.note          = note;
        lock.createdAt     = now;
        lock.revocable     = revocable;
        lock.revoked       = false;

        ByteString lockKey = lockIdToKey(lockId);
        locksMap.put(lockKey, stdLib.serialize(lock));

        // Secondary indexes — key = subjectHash || lockId, value = empty existence flag.
        ByteString empty = new ByteString("");
        byBenMap.put(beneficiary.toByteString().concat(lockKey), empty);
        byDepMap.put(from.toByteString().concat(lockKey), empty);
        byTokenMap.put(token.toByteString().concat(lockKey), empty);

        // Total locked per token
        ByteString tlRaw = totalLockedMap.get(token.toByteString());
        int prevTotal = tlRaw == null ? 0 : tlRaw.toInt();
        totalLockedMap.put(token.toByteString(), prevTotal + amount);

        onLockCreated.fire(lockId, from, beneficiary, token, amount, scheduleType, endTime, category);
    }

    /**
     * Beneficiary withdraws their currently-vested-but-unclaimed amount.
     * Reverts if there is nothing to claim or the caller is not the beneficiary.
     *
     * @return the amount transferred this call
     */
    public static int claim(int lockId) {
        ByteString lockKey = lockIdToKey(lockId);
        ByteString raw = locksMap.get(lockKey);
        if (raw == null) Helper.abort();

        Lock lock = (Lock) stdLib.deserialize(raw);
        if (!Runtime.checkWitness(lock.beneficiary)) Helper.abort();

        int vested = computeVested(lock);
        int claimable = vested - lock.claimedAmount;
        if (claimable <= 0) Helper.abort();

        lock.claimedAmount = vested;
        locksMap.put(lockKey, stdLib.serialize(lock));

        Object res = Contract.call(
                lock.token, "transfer", CallFlags.All,
                new Object[]{ Runtime.getExecutingScriptHash(), lock.beneficiary, claimable, new ByteString("") }
        );
        if (!((boolean) res)) Helper.abort();

        onClaimed.fire(lockId, lock.beneficiary, claimable);
        return claimable;
    }

    /**
     * Depositor revokes the unvested portion of a revocable lock. The
     * beneficiary keeps the right to claim what already vested at the moment
     * of revocation; the schedule is frozen — no further vesting accrues.
     */
    public static void revoke(int lockId) {
        ByteString lockKey = lockIdToKey(lockId);
        ByteString raw = locksMap.get(lockKey);
        if (raw == null) Helper.abort();

        Lock lock = (Lock) stdLib.deserialize(raw);
        if (!lock.revocable || lock.revoked) Helper.abort();
        if (!Runtime.checkWitness(lock.depositor)) Helper.abort();

        // Freeze the schedule by clamping totalAmount to what's vested now.
        // After this, vestedAmount() returns lock.totalAmount permanently and
        // the beneficiary can claim the remaining (vested - claimed).
        int vested = computeVestedRaw(lock);
        int unvested = lock.totalAmount - vested;

        lock.totalAmount = vested;
        lock.revoked = true;
        locksMap.put(lockKey, stdLib.serialize(lock));

        // Adjust totalLocked for the token
        ByteString tlRaw = totalLockedMap.get(lock.token.toByteString());
        int prevTotal = tlRaw == null ? 0 : tlRaw.toInt();
        totalLockedMap.put(lock.token.toByteString(), prevTotal - unvested);

        if (unvested > 0) {
            Object res = Contract.call(
                    lock.token, "transfer", CallFlags.All,
                    new Object[]{ Runtime.getExecutingScriptHash(), lock.depositor, unvested, new ByteString("") }
            );
            if (!((boolean) res)) Helper.abort();
        }

        onRevoked.fire(lockId, lock.depositor, unvested);
    }

    // ---- Read methods ----

    @Safe
    public static Lock getLock(int lockId) {
        ByteString raw = locksMap.get(lockIdToKey(lockId));
        if (raw == null) return null;
        return (Lock) stdLib.deserialize(raw);
    }

    @Safe
    public static int getLockCount() {
        ByteString v = Storage.get(ctx, PREFIX_COUNTER);
        return v == null ? 0 : v.toInt();
    }

    @Safe
    public static int vestedAmount(int lockId) {
        ByteString raw = locksMap.get(lockIdToKey(lockId));
        if (raw == null) return 0;
        return computeVested((Lock) stdLib.deserialize(raw));
    }

    @Safe
    public static int claimableAmount(int lockId) {
        ByteString raw = locksMap.get(lockIdToKey(lockId));
        if (raw == null) return 0;
        Lock lock = (Lock) stdLib.deserialize(raw);
        int v = computeVested(lock);
        return v > lock.claimedAmount ? v - lock.claimedAmount : 0;
    }

    @Safe
    public static int totalLocked(Hash160 token) {
        ByteString v = totalLockedMap.get(token.toByteString());
        return v == null ? 0 : v.toInt();
    }

    @Safe
    public static Iterator<ByteString> getLocksByBeneficiary(Hash160 beneficiary) {
        ByteString prefix = new ByteString(PREFIX_BY_BEN).concat(beneficiary.toByteString());
        return Storage.find(ctx, prefix, FindOptions.KeysOnly | FindOptions.RemovePrefix);
    }

    @Safe
    public static Iterator<ByteString> getLocksByDepositor(Hash160 depositor) {
        ByteString prefix = new ByteString(PREFIX_BY_DEP).concat(depositor.toByteString());
        return Storage.find(ctx, prefix, FindOptions.KeysOnly | FindOptions.RemovePrefix);
    }

    @Safe
    public static Iterator<ByteString> getLocksByToken(Hash160 token) {
        ByteString prefix = new ByteString(PREFIX_BY_TOKEN).concat(token.toByteString());
        return Storage.find(ctx, prefix, FindOptions.KeysOnly | FindOptions.RemovePrefix);
    }

    // ---- Schedule math ----

    private static int computeVested(Lock lock) {
        // Once revoked, totalAmount has been clamped to the vested-at-revoke value.
        // The schedule is frozen; nothing further vests.
        if (lock.revoked) return lock.totalAmount;
        return computeVestedRaw(lock);
    }

    private static int computeVestedRaw(Lock lock) {
        int now = Runtime.getTime() / 1000;

        if (lock.scheduleType == SCHED_CLIFF) {
            return now >= lock.startTime ? lock.totalAmount : 0;
        }

        if (lock.scheduleType == SCHED_LINEAR) {
            if (lock.cliffTime != 0 && now < lock.cliffTime) return 0;
            if (now >= lock.endTime) return lock.totalAmount;
            if (now <= lock.startTime) return 0;
            return lock.totalAmount * (now - lock.startTime) / (lock.endTime - lock.startTime);
        }

        if (lock.scheduleType == SCHED_STEPPED) {
            Object[] arr = (Object[]) stdLib.deserialize(lock.tranches);
            int sum = 0;
            for (int i = 0; i < arr.length; i++) {
                Object[] pair = (Object[]) arr[i];
                int ts  = (int) pair[0];
                int amt = (int) pair[1];
                if (ts <= now) sum += amt;
            }
            return sum;
        }

        return 0;
    }

    // ---- Helpers ----

    /** Encode a lockId as a ByteString (the value of `int` in Neo VM). */
    private static ByteString lockIdToKey(int lockId) {
        return new ByteString(lockId);
    }
}
