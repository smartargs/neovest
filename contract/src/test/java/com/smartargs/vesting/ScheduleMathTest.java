package com.smartargs.vesting;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

/**
 * Stepped-vesting tests are gathered here separately — they need off-chain
 * StdLib serialization of the tranche array, which is the messy bit. Stub
 * for now; flesh out together with a {@code TrancheCodec} helper that lives
 * in the test sources and produces bytes byte-for-byte identical to the
 * contract's deserialize input.
 */
public class ScheduleMathTest {

    @Test @Disabled("stepped tests pending: needs StdLib-compatible tranche codec in test code")
    void stepped_unlocksDiscretely() {}
}
