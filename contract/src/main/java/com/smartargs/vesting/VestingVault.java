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
import io.neow3j.devpack.annotations.ManifestExtra;
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
 *
 * <p>The public methods are intentionally short — each one reads as a list of
 * named steps. Validation, decoding, persistence and outbound transfer logic
 * live in private helpers below the public surface so the high-level flow can
 * be audited at a glance.
 *
 * <p>Hardening notes (post-audit, see {@code docs/SECURITY.md}):
 * <ul>
 *   <li>{@code @Permission} narrowed to {@code transfer} only.</li>
 *   <li>Re-entrancy guard via {@link Runtime#getInvocationCounter} on every
 *       state-mutating method.</li>
 *   <li>State persisted before any cross-contract call (CEI).</li>
 *   <li>All aborts carry a {@code "VV: …"} message.</li>
 *   <li>Stepped tranches bounded to 64 entries.</li>
 *   <li>Mint-as-deposit ({@code from == null}) rejected.</li>
 * </ul>
 */
@DisplayName("VestingVault")
@ManifestExtra(key = "Author", value = "smartargs")
@ManifestExtra(key = "Source", value = "https://github.com/smartargs/neovest")
@ManifestExtra(key = "License", value = "MIT")
@Permission(contract = "*", methods = "transfer")
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
    private static final StdLib stdLib = new StdLib();

    // ---- Schedule type codes ----

    private static final byte SCHED_CLIFF   = 0;
    private static final byte SCHED_LINEAR  = 1;
    private static final byte SCHED_STEPPED = 2;

    /** Hard cap on the number of tranches in a stepped schedule. Bounds GAS cost
     * of every read of a stepped lock (which deserializes the array each call). */
    private static final int MAX_TRANCHES = 64;

    // ---- Events ----

    @DisplayName("LockCreated")
    private static Event8Args<Integer, Hash160, Hash160, Hash160, Integer, Integer, Integer, String> onLockCreated;

    @DisplayName("Claimed")
    private static Event3Args<Integer, Hash160, Integer> onClaimed;

    @DisplayName("Revoked")
    private static Event3Args<Integer, Hash160, Integer> onRevoked;

    // =============================================================
    // Public surface
    // =============================================================

    /**
     * NEP-17 push callback. The token transfer is taken to be a deposit into
     * the vault; {@code data} is decoded as the lock parameters and a new
     * {@link Lock} is created. Any validation failure aborts the entire
     * transfer.
     *
     * <p>Expected {@code data} shape (Object[9]):
     * {@code [beneficiary, scheduleType, startTime, endTime, cliffTime,
     *  tranches, category, note, revocable]}.
     */
    @OnNEP17Payment
    public static void onPayment(Hash160 from, int amount, Object data) {
        requireValidPayment(from, amount, data);

        Hash160 token = Runtime.getCallingScriptHash();
        if (token == null) Helper.abort("VV: no calling token");

        Lock lock = decodeLock(from, token, amount, (Object[]) data);
        validateAndNormalizeSchedule(lock, amount);

        lock.lockId = nextLockId();
        persistLock(lock);

        onLockCreated.fire(lock.lockId, lock.depositor, lock.beneficiary, lock.token,
                lock.totalAmount, (int) lock.scheduleType, lock.endTime, lock.category);
    }

    /**
     * Beneficiary withdraws their currently-vested-but-unclaimed amount.
     * Reverts if there is nothing to claim or the caller is not the beneficiary.
     *
     * @return the amount transferred this call
     */
    public static int claim(int lockId) {
        guardReentry();

        Lock lock = loadLockOrAbort(lockId);
        if (!Runtime.checkWitness(lock.beneficiary)) Helper.abort("VV: not beneficiary");

        int vested = computeVested(lock);
        int claimable = vested - lock.claimedAmount;
        if (claimable <= 0) Helper.abort("VV: nothing to claim");

        // CEI: persist new claimedAmount before the external transfer.
        lock.claimedAmount = vested;
        locksMap.put(lockIdToKey(lockId), stdLib.serialize(lock));

        transferOut(lock.token, lock.beneficiary, claimable, "VV: transfer failed");

        onClaimed.fire(lockId, lock.beneficiary, claimable);
        return claimable;
    }

    /**
     * Depositor revokes the unvested portion of a revocable lock. The
     * beneficiary keeps the right to claim what already vested at the moment
     * of revocation; the schedule is frozen — no further vesting accrues.
     */
    public static void revoke(int lockId) {
        guardReentry();

        Lock lock = loadLockOrAbort(lockId);
        if (!lock.revocable) Helper.abort("VV: not revocable");
        if (lock.revoked) Helper.abort("VV: already revoked");
        if (!Runtime.checkWitness(lock.depositor)) Helper.abort("VV: not depositor");

        int vested = computeVestedRaw(lock);
        int unvested = lock.totalAmount - vested;

        // CEI: freeze the schedule and update bookkeeping before any transfer.
        lock.totalAmount = vested;
        lock.revoked = true;
        locksMap.put(lockIdToKey(lockId), stdLib.serialize(lock));
        decreaseTotalLocked(lock.token, unvested);

        if (unvested > 0) {
            transferOut(lock.token, lock.depositor, unvested, "VV: refund failed");
        }

        onRevoked.fire(lockId, lock.depositor, unvested);
    }

    // ---- Read methods ----

    @Safe
    public static Lock getLock(int lockId) {
        return loadLock(lockId);
    }

    @Safe
    public static int getLockCount() {
        ByteString v = Storage.get(ctx, PREFIX_COUNTER);
        return v == null ? 0 : v.toInt();
    }

    @Safe
    public static int vestedAmount(int lockId) {
        Lock lock = loadLock(lockId);
        return lock == null ? 0 : computeVested(lock);
    }

    @Safe
    public static int claimableAmount(int lockId) {
        Lock lock = loadLock(lockId);
        if (lock == null) return 0;
        int vested = computeVested(lock);
        return vested > lock.claimedAmount ? vested - lock.claimedAmount : 0;
    }

    @Safe
    public static int totalLocked(Hash160 token) {
        ByteString v = totalLockedMap.get(token.toByteString());
        return v == null ? 0 : v.toInt();
    }

    /**
     * Iterator of lockIds where the given address is the beneficiary.
     * Each emitted {@link ByteString} round-trips to {@code int} via
     * {@code ByteString.toInt()}.
     */
    @Safe
    public static Iterator<ByteString> getLocksByBeneficiary(Hash160 beneficiary) {
        return findByPrefix(PREFIX_BY_BEN, beneficiary);
    }

    @Safe
    public static Iterator<ByteString> getLocksByDepositor(Hash160 depositor) {
        return findByPrefix(PREFIX_BY_DEP, depositor);
    }

    @Safe
    public static Iterator<ByteString> getLocksByToken(Hash160 token) {
        return findByPrefix(PREFIX_BY_TOKEN, token);
    }

    // =============================================================
    // Helpers — validation
    // =============================================================

    private static void requireValidPayment(Hash160 from, int amount, Object data) {
        // Reject mint-as-deposit (NEP-17 emits transfer with from == null on mint).
        // A null depositor would make the lock unrevokable forever.
        if (from == null || !Hash160.isValid(from) || from.isZero()) Helper.abort("VV: bad from");
        if (amount <= 0) Helper.abort("VV: bad amount");
        if (data == null) Helper.abort("VV: no data");
    }

    private static void requireValidBeneficiary(Hash160 beneficiary) {
        if (beneficiary == null || !Hash160.isValid(beneficiary) || beneficiary.isZero()) {
            Helper.abort("VV: bad beneficiary");
        }
        // Vault as its own beneficiary makes no sense and would let anyone with
        // contract-call ability drain via claim().
        if (beneficiary.equals(Runtime.getExecutingScriptHash())) Helper.abort("VV: self-beneficiary");
    }

    /**
     * Decodes the {@code data} payload into a populated {@link Lock} (lockId
     * still 0 — caller assigns it). All field-level validation happens here;
     * cross-field schedule validation is in {@link #validateAndNormalizeSchedule}.
     */
    private static Lock decodeLock(Hash160 from, Hash160 token, int amount, Object[] params) {
        if (params.length != 9) Helper.abort("VV: bad data length");

        Hash160 beneficiary = (Hash160) params[0];
        requireValidBeneficiary(beneficiary);

        int scheduleType = (int) params[1];
        int startTime    = (int) params[2];
        int endTime      = (int) params[3];
        int cliffTime    = (int) params[4];
        ByteString tranches = (ByteString) params[5];
        String category  = (String) params[6];
        String note      = (String) params[7];
        boolean revocable = (boolean) params[8];

        if (category == null || category.length() > 32) Helper.abort("VV: bad category");
        if (note == null) note = "";
        if (note.length() > 256) Helper.abort("VV: bad note");

        Lock lock = new Lock();
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
        lock.createdAt     = Runtime.getTime() / 1000;
        lock.revocable     = revocable;
        lock.revoked       = false;
        return lock;
    }

    /**
     * Cross-field schedule validation. May normalize the lock in-place
     * (e.g., clamp endTime for cliff, derive start/end from tranches).
     */
    private static void validateAndNormalizeSchedule(Lock lock, int amount) {
        int now = Runtime.getTime() / 1000;

        if (lock.scheduleType == SCHED_CLIFF) {
            if (lock.startTime <= now) Helper.abort("VV: cliff in past");
            lock.endTime = lock.startTime;
            lock.cliffTime = 0;
            return;
        }
        if (lock.scheduleType == SCHED_LINEAR) {
            if (lock.startTime >= lock.endTime) Helper.abort("VV: bad linear range");
            if (lock.cliffTime != 0 && (lock.cliffTime < lock.startTime || lock.cliffTime > lock.endTime)) {
                Helper.abort("VV: cliff out of range");
            }
            return;
        }
        if (lock.scheduleType == SCHED_STEPPED) {
            validateAndNormalizeStepped(lock, amount, now);
            return;
        }
        Helper.abort("VV: bad schedule type");
    }

    private static void validateAndNormalizeStepped(Lock lock, int amount, int now) {
        if (lock.tranches == null || lock.tranches.length() == 0) Helper.abort("VV: no tranches");
        Object[] arr = (Object[]) stdLib.deserialize(lock.tranches);
        if (arr.length < 1) Helper.abort("VV: empty tranches");
        if (arr.length > MAX_TRANCHES) Helper.abort("VV: too many tranches");

        int sum = 0;
        int prevTs = -1;
        for (int i = 0; i < arr.length; i++) {
            Object[] pair = (Object[]) arr[i];
            if (pair == null || pair.length < 2) Helper.abort("VV: bad tranche");
            int ts  = (int) pair[0];
            int amt = (int) pair[1];
            if (ts <= prevTs) Helper.abort("VV: tranches unsorted");
            if (ts <= now) Helper.abort("VV: tranche in past");
            if (amt <= 0) Helper.abort("VV: bad tranche amount");
            sum += amt;
            prevTs = ts;
        }
        if (sum != amount) Helper.abort("VV: tranche sum mismatch");

        // Derive bounds from first/last tranche timestamps.
        lock.startTime = (int) ((Object[]) arr[0])[0];
        lock.endTime   = (int) ((Object[]) arr[arr.length - 1])[0];
        lock.cliffTime = 0;
    }

    // =============================================================
    // Helpers — persistence
    // =============================================================

    private static int nextLockId() {
        ByteString counterRaw = Storage.get(ctx, PREFIX_COUNTER);
        int next = (counterRaw == null ? 0 : counterRaw.toInt()) + 1;
        Storage.put(ctx, PREFIX_COUNTER, next);
        return next;
    }

    /** Writes the lock body, secondary indexes, and totalLocked for a brand-new lock. */
    private static void persistLock(Lock lock) {
        ByteString lockKey = lockIdToKey(lock.lockId);
        locksMap.put(lockKey, stdLib.serialize(lock));

        increaseTotalLocked(lock.token, lock.totalAmount);

        ByteString empty = new ByteString("");
        byBenMap.put(lock.beneficiary.toByteString().concat(lockKey), empty);
        byDepMap.put(lock.depositor.toByteString().concat(lockKey), empty);
        byTokenMap.put(lock.token.toByteString().concat(lockKey), empty);
    }

    private static void increaseTotalLocked(Hash160 token, int delta) {
        ByteString tlRaw = totalLockedMap.get(token.toByteString());
        int prev = tlRaw == null ? 0 : tlRaw.toInt();
        totalLockedMap.put(token.toByteString(), prev + delta);
    }

    private static void decreaseTotalLocked(Hash160 token, int delta) {
        ByteString tlRaw = totalLockedMap.get(token.toByteString());
        int prev = tlRaw == null ? 0 : tlRaw.toInt();
        totalLockedMap.put(token.toByteString(), prev - delta);
    }

    /** Returns the lock or null. */
    private static Lock loadLock(int lockId) {
        ByteString raw = locksMap.get(lockIdToKey(lockId));
        if (raw == null) return null;
        return (Lock) stdLib.deserialize(raw);
    }

    /** Returns the lock; aborts if missing. */
    private static Lock loadLockOrAbort(int lockId) {
        Lock lock = loadLock(lockId);
        if (lock == null) Helper.abort("VV: lock not found");
        return lock;
    }

    private static Iterator<ByteString> findByPrefix(byte[] indexPrefix, Hash160 subject) {
        ByteString prefix = new ByteString(indexPrefix).concat(subject.toByteString());
        return Storage.find(ctx, prefix, FindOptions.KeysOnly | FindOptions.RemovePrefix);
    }

    // =============================================================
    // Helpers — outbound transfer + control flow
    // =============================================================

    /**
     * Sends {@code amount} of {@code token} from this vault to {@code to}.
     * Aborts with {@code errMsg} if the token returns false or null. The
     * vault's permission allows only the {@code "transfer"} method, so a
     * malicious token cannot trick us into invoking arbitrary code on it.
     */
    private static void transferOut(Hash160 token, Hash160 to, int amount, String errMsg) {
        Object res = Contract.call(token, "transfer", CallFlags.All,
                new Object[]{ Runtime.getExecutingScriptHash(), to, amount, new ByteString("") });
        if (res == null || !((boolean) res)) Helper.abort(errMsg);
    }

    /**
     * Re-entrancy guard. Faults if this contract is already on the call stack
     * within the current transaction. State-mutating methods call this first
     * to defend against malicious tokens that re-enter the vault during our
     * outbound {@code transfer}.
     */
    private static void guardReentry() {
        if (Runtime.getInvocationCounter() != 1) Helper.abort("VV: re-entry");
    }

    // =============================================================
    // Helpers — schedule math
    // =============================================================

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
            return computeLinear(lock, now);
        }
        if (lock.scheduleType == SCHED_STEPPED) {
            return computeStepped(lock, now);
        }
        return 0;
    }

    private static int computeLinear(Lock lock, int now) {
        if (lock.cliffTime != 0 && now < lock.cliffTime) return 0;
        if (now >= lock.endTime) return lock.totalAmount;
        if (now < lock.startTime) return 0;
        // Defense in depth: division-by-zero is unreachable given onPayment
        // validation (start < end), but bounded subtraction keeps the
        // invariant locally provable.
        int duration = lock.endTime - lock.startTime;
        if (duration <= 0) return 0;
        return lock.totalAmount * (now - lock.startTime) / duration;
    }

    private static int computeStepped(Lock lock, int now) {
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

    // =============================================================
    // Helpers — keys
    // =============================================================

    /** Encode a lockId as a ByteString (the value of {@code int} in Neo VM). */
    private static ByteString lockIdToKey(int lockId) {
        return new ByteString(lockId);
    }
}
