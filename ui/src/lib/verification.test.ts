import { describe, it, expect } from 'vitest';
import { classifyDeployedNef, EXPECTED_NEF_CHECKSUM, EXPECTED_NEF_SCRIPT_SHA256 } from './verification';

// The bundled expected values are real (generated from the compiled NEF by
// scripts/sync-checksum.mjs). These tests assert the *decision logic* in
// classifyDeployedNef around whichever values are baked into this build.

describe('classifyDeployedNef', () => {
  it('returns "unknown" when the NEF info is null (RPC failed / not found)', () => {
    expect(classifyDeployedNef(null)).toBe('unknown');
  });

  it('returns "verified" when the deployed script hash matches the bundled hash', () => {
    expect(classifyDeployedNef({ checksum: 0, scriptSha256: EXPECTED_NEF_SCRIPT_SHA256 })).toBe('verified');
  });

  it('returns "unverified" when the deployed script hash differs', () => {
    expect(classifyDeployedNef({ checksum: EXPECTED_NEF_CHECKSUM, scriptSha256: 'deadbeef' })).toBe('unverified');
  });

  it('script hash is authoritative: a matching checksum cannot rescue a wrong script', () => {
    // Attack shape: an attacker forges a 32-bit checksum collision but cannot
    // reproduce the SHA-256 of the real script. Must read as unverified.
    expect(classifyDeployedNef({ checksum: EXPECTED_NEF_CHECKSUM, scriptSha256: 'deadbeef' })).toBe('unverified');
  });

  describe('checksum fallback (only when the script is unavailable)', () => {
    it('returns "verified" when the script is missing but the checksum matches', () => {
      expect(classifyDeployedNef({ checksum: EXPECTED_NEF_CHECKSUM, scriptSha256: null })).toBe('verified');
    });

    it('returns "unverified" when the script is missing and the checksum differs', () => {
      expect(classifyDeployedNef({ checksum: EXPECTED_NEF_CHECKSUM + 1, scriptSha256: null })).toBe('unverified');
    });

    it('returns "unknown" when neither the script nor the checksum is available', () => {
      expect(classifyDeployedNef({ checksum: null, scriptSha256: null })).toBe('unknown');
    });
  });

  it('the bundled script hash is a full 32-byte SHA-256 (not a 4-byte checksum)', () => {
    // Guards against a regression where the strong commitment silently
    // degrades back to the weak 32-bit value.
    expect(EXPECTED_NEF_SCRIPT_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });
});
