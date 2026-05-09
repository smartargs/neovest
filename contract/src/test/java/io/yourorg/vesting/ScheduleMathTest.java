package io.yourorg.vesting;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

/**
 * Pure-math tests for {@code vestedAmount} and {@code claimableAmount}, exercised
 * via on-chain {@code invokeFunction} reads with chain time advanced via the
 * test extension. Kept separate from {@link VestingVaultTest} so the schedule
 * math can be cross-checked against {@code ui/src/lib/vesting-math.ts} using
 * shared test vectors (plan §5.5).
 *
 * <p>SCAFFOLD — implement together with the contract math.
 */
public class ScheduleMathTest {

    @Test @Disabled("scaffold")
    void cliff_boundaryBehaviour() {}

    @Test @Disabled("scaffold")
    void linear_sampledAtTenPoints() {}

    @Test @Disabled("scaffold")
    void linear_withCliff_isFlatThenLinear() {}

    @Test @Disabled("scaffold")
    void stepped_unlocksDiscretely() {}
}
