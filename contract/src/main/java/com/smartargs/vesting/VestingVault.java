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
import io.neow3j.devpack.annotations.OnDeployment;
import io.neow3j.devpack.annotations.OnNEP17Payment;
import io.neow3j.devpack.annotations.Permission;
import io.neow3j.devpack.annotations.Safe;
import io.neow3j.devpack.constants.CallFlags;
import io.neow3j.devpack.constants.FindOptions;
import io.neow3j.devpack.contracts.StdLib;
import io.neow3j.devpack.events.Event3Args;
import io.neow3j.devpack.events.Event8Args;

/**
 * VestingVault — a Neo N3 token vesting contract.
 *
 * <p>The vault has exactly one privileged role: the <strong>owner</strong>,
 * set at deploy time and immutable thereafter. The owner is the only address
 * that can deposit tokens and create new locks (preventing junk locks under
 * the vault's address). The vault accepts any NEP-17 token, allowing a single
 * project to vest team / investor / treasury allocations across multiple
 * tokens in one place.
 *
 * <p>Beyond deposit gating, the contract is otherwise fully trustless:
 * <ul>
 *   <li>The owner cannot claim, drain, freeze, or update the vault.</li>
 *   <li>The owner can {@link #revoke} a lock <em>only</em> if it was created
 *       with {@code revocable: true}, and the recovered tokens go back to
 *       the depositor (= owner).</li>
 *   <li>If the owner key is lost: no new locks can be created, but every
 *       existing lock's claim/revoke continues to work.</li>
 *   <li>No update path, no destroy.</li>
 * </ul>
 *
 * <p>Hardening notes (post-audit, see {@code docs/SECURITY.md}):
 * <ul>
 *   <li>{@code @Permission} narrowed to {@code transfer}.</li>
 *   <li>Re-entrancy guard via {@link Runtime#getInvocationCounter} on every
 *       state-mutating method.</li>
 *   <li>State persisted before any cross-contract call (CEI).</li>
 *   <li>All aborts carry a {@code "VV: …"} message.</li>
 *   <li>Stepped tranches bounded to 64 entries.</li>
 *   <li>{@code totalLocked} tracks tokens actually held: it is decreased on
 *       both {@code claim} (by the amount paid out) and {@code revoke} (by the
 *       unvested refund), so the figure never overstates the vault's balance.</li>
 *   <li>Every schedule type must end in the future at creation time — cliff
 *       ({@code start > now}), stepped (every tranche {@code ts > now}), and
 *       linear ({@code end > now}) — so no lock can be created already fully
 *       vested.</li>
 *   <li>The serialized tranche blob is cleared on cliff/linear locks; it is
 *       only stored for stepped schedules that actually read it.</li>
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
    private static final byte[] KEY_OWNER            = new byte[]{0x07};

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

    /** Hard cap on the number of tranches in a stepped schedule. */
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
     * One-shot initializer fired by {@code ContractManagement.deploy}. The
     * {@code data} argument MUST be the {@link Hash160} of the address that
     * will own this vault — the only address allowed to deposit.
     */
    @OnDeployment
    public static void deploy(Object data, boolean update) {
        if (update) return;
        if (data == null) Helper.abort("VV: deploy needs owner hash");
        Hash160 owner = (Hash160) data;
        if (!Hash160.isValid(owner) || owner.isZero()) Helper.abort("VV: bad owner hash");
        Storage.put(ctx, KEY_OWNER, owner.toByteString());
    }

    /**
     * NEP-17 push callback. The transferred tokens are taken as a deposit
     * and {@code data} is decoded as lock parameters. Aborts unless
     * {@code from} equals the vault's owner.
     *
     * <p>Expected {@code data} shape (Object[9]):
     * {@code [beneficiary, scheduleType, startTime, endTime, cliffTime,
     *  tranches, category, note, revocable]}.
     */
    @OnNEP17Payment
    public static void onPayment(Hash160 from, int amount, Object data) {
        requireValidPayment(from, amount, data);

        Hash160 owner = getOwner();
        if (owner == null) Helper.abort("VV: not initialized");
        if (!from.equals(owner)) Helper.abort("VV: not owner");

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
     * @return the amount transferred this call
     */
    public static int claim(int lockId) {
        guardReentry();

        Lock lock = loadLockOrAbort(lockId);
        if (!Runtime.checkWitness(lock.beneficiary)) Helper.abort("VV: not beneficiary");

        int vested = computeVested(lock);
        int claimable = vested - lock.claimedAmount;
        if (claimable <= 0) Helper.abort("VV: nothing to claim");

        lock.claimedAmount = vested;
        locksMap.put(lockIdToKey(lockId), stdLib.serialize(lock));
        decreaseTotalLocked(lock.token, claimable);

        transferOut(lock.token, lock.beneficiary, claimable, "VV: transfer failed");

        onClaimed.fire(lockId, lock.beneficiary, claimable);
        return claimable;
    }

    /**
     * Depositor revokes the unvested portion of a revocable lock. The
     * beneficiary keeps the right to claim what already vested at the moment
     * of revocation; the schedule is frozen — no further vesting accrues.
     *
     * <p>Since only the owner can deposit, the depositor of every lock is the
     * vault's owner — so {@code revoke} is effectively owner-only.
     */
    public static void revoke(int lockId) {
        guardReentry();

        Lock lock = loadLockOrAbort(lockId);
        if (!lock.revocable) Helper.abort("VV: not revocable");
        if (lock.revoked) Helper.abort("VV: already revoked");
        if (!Runtime.checkWitness(lock.depositor)) Helper.abort("VV: not depositor");

        int vested = computeVestedRaw(lock);
        int unvested = lock.totalAmount - vested;

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

    /** The address that may deposit into this vault. Set once at deploy. */
    @Safe
    public static Hash160 getOwner() {
        ByteString v = Storage.get(ctx, KEY_OWNER);
        if (v == null) return null;
        return new Hash160(v);
    }

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

    /** Total amount currently locked of {@code token}. */
    @Safe
    public static int totalLocked(Hash160 token) {
        ByteString v = totalLockedMap.get(token.toByteString());
        return v == null ? 0 : v.toInt();
    }

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
        if (from == null || !Hash160.isValid(from) || from.isZero()) Helper.abort("VV: bad from");
        if (amount <= 0) Helper.abort("VV: bad amount");
        if (data == null) Helper.abort("VV: no data");
    }

    private static void requireValidBeneficiary(Hash160 beneficiary) {
        if (beneficiary == null || !Hash160.isValid(beneficiary) || beneficiary.isZero()) {
            Helper.abort("VV: bad beneficiary");
        }
        if (beneficiary.equals(Runtime.getExecutingScriptHash())) Helper.abort("VV: self-beneficiary");
    }

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

    private static void validateAndNormalizeSchedule(Lock lock, int amount) {
        int now = Runtime.getTime() / 1000;

        if (lock.scheduleType == SCHED_CLIFF) {
            if (lock.startTime <= now) Helper.abort("VV: cliff in past");
            lock.endTime = lock.startTime;
            lock.cliffTime = 0;
            lock.tranches = new ByteString("");
            return;
        }
        if (lock.scheduleType == SCHED_LINEAR) {
            if (lock.startTime >= lock.endTime) Helper.abort("VV: bad linear range");
            // The whole vesting window must not already be in the past — a fully
            // back-dated linear lock would be 100% claimable the instant it's
            // created, which is never the intent. This mirrors the future-date
            // requirement on cliff (startTime > now) and stepped (every tranche
            // ts > now): for all three schedule types, vesting ends in the future.
            if (lock.endTime <= now) Helper.abort("VV: linear in past");
            if (lock.cliffTime != 0 && (lock.cliffTime < lock.startTime || lock.cliffTime > lock.endTime)) {
                Helper.abort("VV: cliff out of range");
            }
            lock.tranches = new ByteString("");
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
        ByteString raw = totalLockedMap.get(token.toByteString());
        int prev = raw == null ? 0 : raw.toInt();
        totalLockedMap.put(token.toByteString(), prev + delta);
    }

    private static void decreaseTotalLocked(Hash160 token, int delta) {
        ByteString raw = totalLockedMap.get(token.toByteString());
        int prev = raw == null ? 0 : raw.toInt();
        totalLockedMap.put(token.toByteString(), prev - delta);
    }

    private static Lock loadLock(int lockId) {
        ByteString raw = locksMap.get(lockIdToKey(lockId));
        if (raw == null) return null;
        return (Lock) stdLib.deserialize(raw);
    }

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

    private static void transferOut(Hash160 token, Hash160 to, int amount, String errMsg) {
        Object res = Contract.call(token, "transfer", CallFlags.All,
                new Object[]{ Runtime.getExecutingScriptHash(), to, amount, new ByteString("") });
        if (res == null || !((boolean) res)) Helper.abort(errMsg);
    }

    private static void guardReentry() {
        if (Runtime.getInvocationCounter() != 1) Helper.abort("VV: re-entry");
    }

    // =============================================================
    // Helpers — schedule math
    // =============================================================

    private static int computeVested(Lock lock) {
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

    private static ByteString lockIdToKey(int lockId) {
        return new ByteString(lockId);
    }
}
