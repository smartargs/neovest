# Verifying a Deployed VestingVault

A beneficiary should be able to confirm that the contract holding their
tokens is exactly the one in this repository — no hidden changes, no admin
backdoor — before trusting it.

## What to verify

Two things must match:

1. **The deployed `.nef` bytecode**, fetched via RPC from the network, must
   hash to the same value as a `.nef` you compile yourself from this source.
2. **The deployed manifest** (ABI + permissions) must match the manifest
   produced by your compile.

If either differs, the contract is not what this repo describes — do not
deposit into it.

## Steps

1. **Pin the version.** Check out the same git tag the deployer claims to
   have used.

   ```bash
   git checkout <tag>
   ```

2. **Verify pinned tooling.** The `neow3jVersion` and `javaVersion` in
   `gradle.properties` must match what the deployer used. Different compiler
   versions can produce different bytecode.

3. **Compile.**

   ```bash
   ./gradlew :contract:neow3jCompile
   ```

4. **Hash your local `.nef`.**

   ```bash
   sha256sum contract/build/neow3j/VestingVault.nef
   ```

5. **Fetch the deployed contract** from any Neo N3 block explorer (Neoscan,
   Dora, etc.) or via RPC:

   ```bash
   curl -s -X POST $NEO_RPC \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"getcontractstate","params":["<contract-hash>"],"id":1}'
   ```

   The response includes both the bytecode (script) and the manifest.

6. **Compare.** The script hash and manifest fields should match what you
   compiled locally. Any difference means the deployed contract is not this
   source.

## Automated check in the dashboard

The dashboard performs the bytecode half of this comparison for you. On every
vault view it fetches the deployed contract's NEF via RPC, computes the
**SHA-256 of the deployed script bytes**, and compares it against the hash of
the bundled audited NEF (`EXPECTED_NEF_SCRIPT_SHA256`, regenerated from the
compiled `.nef` at build time). A match drives the green **Verified** badge.

The SHA-256 is collision-resistant, so the badge is a strong commitment that
the deployed program is byte-for-byte the bundled source. (The NEF's built-in
4-byte checksum is only used as a fast pre-filter / fallback — it is 32 bits
and not collision-resistant, so it is never the sole basis for the badge.)
The badge does not yet compare the manifest, so for high-value vaults still
run the manual steps above.

## Why immutability matters

The contract has no `update` method, no admin role, and no upgrade proxy.
Once verified at deployment time, it cannot change. That is the whole point.

If you find a discrepancy, treat the deployed contract as untrusted until
the deployer can explain it.
