# Contributing to NeoVest

Thanks for your interest. NeoVest is a small project — most contributions
take the form of bug fixes, documentation improvements, or follow-ups from
[`ROADMAP.md`](ROADMAP.md).

## Ground rules

- **Small, focused changes.** Contract changes affect bytecode; even
  whitespace-only edits change the deployed hash, so reviewers want to see
  the smallest possible diff for any contract change.
- **Tests with every contract change.** The test suite in `contract/src/test`
  covers every `Helper.abort()` site. Add coverage for new branches; don't
  loosen existing tests.
- **No new dependencies in the contract.** The Java side uses only the
  neow3j devpack. Any new import needs an explicit reason.
- **No new privileged role.** The contract has exactly one privileged role
  (`owner`) by design. Adding admin functions, pausability, or
  upgradeability would compromise the trust model — those changes will be
  declined.

## Workflow

1. **Fork** and create a branch from `main`. Branch naming: `fix/...`,
   `feat/...`, `docs/...`.
2. **Run the tests** locally:
   ```
   ./gradlew :contract:test
   cd ui && npx tsc -b && npm run lint
   ```
   Both must pass before opening a PR.
3. **Write a focused commit message.** Conventional Commits prefix:
   `feat`, `fix`, `docs`, `refactor`, `test`, `chore`. Keep the subject
   under 72 characters; the body explains *why* if non-obvious.
4. **Open a PR** against `main`. Describe what changed, why, and how you
   verified it. Link any related issue or roadmap item.

## Reviewing

PRs need at least one approving review before merge. Maintainers may push
small style tweaks to your branch directly to keep the queue moving.

## Local development

The full local-development walkthrough — including a Docker-based private
Neo3 net for end-to-end testing — is in [`docs/LOCAL.md`](docs/LOCAL.md).

Quick orientation:

```
./gradlew :contract:test           # contract unit + integration tests
./gradlew :contract:neow3jCompile  # produces NEF + manifest under build/
cd ui && npm install && npm run dev
```

The UI's `predev` hook auto-bundles the latest compiled NEF into the build,
so the in-browser deploy path always matches what you compiled.

## Reporting bugs

Open an issue with:

1. What you expected to happen.
2. What actually happened.
3. A minimal reproduction (network, contract hash, steps).
4. Browser console output if it's a UI bug; relevant `application log`
   excerpt if it's a contract issue.

## Reporting security issues

**Do not open a public issue for security vulnerabilities.** See
[`docs/SECURITY.md`](docs/SECURITY.md) for responsible-disclosure
instructions.

## Style

- **TypeScript:** the existing code style (no semicolons in JSX, single
  quotes, trailing commas) — `npm run lint` enforces it.
- **Java:** the neow3j devpack style; 4-space indent; `Helper.abort("VV: ...")`
  for every revert path so error messages are greppable.
- **Comments:** explain *why* something is non-obvious. Don't restate what
  the code already says.

## Code of conduct

Be respectful. Disagreements about technical direction are expected;
personal attacks or hostility are not. Report misconduct to the
maintainers privately.
