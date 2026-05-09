package io.yourorg.vesting;

import io.neow3j.contract.SmartContract;
import io.neow3j.test.ContractTest;
import io.neow3j.test.ContractTestExtension;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

/**
 * VestingVault tests. SCAFFOLD — every test is currently {@link Disabled}.
 * Implement the contract bodies first, then enable these one by one.
 *
 * <p>Each test below corresponds to a row in plan §3.9. Together they prove:
 * <ul>
 *   <li>Cliff: nothing claimable before {@code startTime}, full amount after.</li>
 *   <li>Linear: vesting math at multiple points; cliff is respected if set.</li>
 *   <li>Stepped: each tranche unlocks at its timestamp and only its share is claimable.</li>
 *   <li>Multi-claim: claiming, waiting, claiming again sums correctly.</li>
 *   <li>Revoke: only depositor can call; only if revocable; beneficiary keeps vested.</li>
 *   <li>Access control: non-beneficiary cannot claim; non-depositor cannot revoke.</li>
 *   <li>Invalid schedules revert at creation (depositor's tokens are not held).</li>
 *   <li>Multi-token / multi-beneficiary isolation.</li>
 *   <li>Iterators return the correct sets.</li>
 * </ul>
 */
@ContractTest(blockTime = 1, contracts = VestingVault.class)
public class VestingVaultTest {

    @RegisterExtension
    private static final ContractTestExtension ext = new ContractTestExtension();

    @SuppressWarnings("unused") private static SmartContract vault;
    @SuppressWarnings("unused") private static SmartContract testToken;

    @BeforeAll
    static void setUp() throws Throwable {
        vault = ext.getDeployedContract(VestingVault.class);
        // TODO(scaffold): deploy TestNep17Token and mint to depositor account
    }

    @Test @Disabled("scaffold")
    void cliffVesting_zeroBeforeStart_fullAtStart() throws Throwable {
        // Create a cliff lock with startTime = now + 100s.
        // At now+50s: vestedAmount == 0, claim() reverts.
        // At now+100s: vestedAmount == totalAmount, claim() transfers everything.
    }

    @Test @Disabled("scaffold")
    void linearVesting_respectsCliff() throws Throwable {
        // Linear over [t0, t0 + 1y] with cliff at t0 + 90d.
        // Before cliff:    vested == 0
        // At cliff:        vested == ~90/365 of total
        // At halfway:      vested == ~50% of total (within rounding)
        // After end:       vested == total
    }

    @Test @Disabled("scaffold")
    void steppedVesting_unlocksTrancheByTranche() throws Throwable {
        // 4 tranches over 4 quarters; verify exactly one tranche claimable per quarter.
    }

    @Test @Disabled("scaffold")
    void claim_onlyBeneficiary() throws Throwable {
        // Non-beneficiary calling claim() should ABORT.
    }

    @Test @Disabled("scaffold")
    void revoke_onlyDepositor_onlyIfRevocable() throws Throwable {
        // Non-depositor revoke should ABORT.
        // Revoke on non-revocable lock should ABORT.
    }

    @Test @Disabled("scaffold")
    void revoke_returnsUnvested_beneficiaryKeepsVested() throws Throwable {
        // After revoke partway through linear vesting, depositor receives the
        // unvested half; beneficiary can still claim() the vested half.
    }

    @Test @Disabled("scaffold")
    void invalidSchedule_rejectsAtCreation() throws Throwable {
        // start >= end, cliff outside [start,end], stepped sums != totalAmount, etc.
        // The transferring depositor's balance must be unchanged after the failed transfer.
    }

    @Test @Disabled("scaffold")
    void multiTokenMultiBeneficiary_isolated() throws Throwable {
        // Token A locks for beneficiary X must not affect Token B locks for X
        // and must not affect Token A locks for beneficiary Y.
    }

    @Test @Disabled("scaffold")
    void iterators_returnCorrectSets() throws Throwable {
        // getLocksByBeneficiary, getLocksByDepositor, getLocksByToken iterators
        // each return exactly the lockIds belonging to their key.
    }
}
