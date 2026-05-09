package io.yourorg.vesting;

import io.neow3j.devpack.ByteString;
import io.neow3j.devpack.Hash160;
import io.neow3j.devpack.annotations.Struct;

/**
 * One vesting position. Stored in {@code locksMap} keyed by {@code lockId},
 * serialized via {@code StdLib.serialize}.
 *
 * <p>Field types are mapped to Neo VM primitives by neow3j: {@code int} is
 * arbitrary-precision (BigInteger at runtime), {@code Hash160} is a 20-byte
 * script hash, {@code ByteString} is an opaque byte buffer (used here to
 * carry the serialized stepped tranche array).
 */
@Struct
public class Lock {
    public int lockId;
    public Hash160 depositor;
    public Hash160 beneficiary;
    public Hash160 token;
    public int totalAmount;
    public int claimedAmount;
    public byte scheduleType;       // 0 = Cliff, 1 = Linear, 2 = Stepped
    public int startTime;           // unix seconds
    public int endTime;             // unix seconds
    public int cliffTime;           // unix seconds; 0 if no cliff
    public ByteString tranches;     // serialized [(timestamp, amount), ...] for stepped; empty otherwise
    public String category;
    public String note;
    public int createdAt;
    public boolean revocable;
    public boolean revoked;
}
