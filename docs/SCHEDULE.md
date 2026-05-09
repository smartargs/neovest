# Vesting Schedule Math

The contract supports three schedule types. The UI mirrors the same math in
`ui/src/lib/vesting-math.ts` for client-side previews; the two
implementations are tested against shared test vectors.

All times are unix seconds. `now` means the current block time.

## Type 0 — Cliff

All tokens unlock at a single date.

```
if now < startTime:    vested = 0
else:                  vested = totalAmount
```

`endTime` equals `startTime` for cliff schedules; `cliffTime` is unused.

**Use case:** investor lockups that end on a single date; airdrops with a
delay.

## Type 1 — Linear (with optional cliff)

Tokens vest continuously between `startTime` and `endTime`. An optional
`cliffTime` delays the start of vesting; once reached, the curve picks up
proportionally as if vesting had been accruing since `startTime`.

```
if cliffTime > 0 and now < cliffTime:    vested = 0
elif now >= endTime:                     vested = totalAmount
else:                                    vested = totalAmount * (now - startTime) / (endTime - startTime)
```

Worked example — 1.2B tokens, 4-year linear, 1-year cliff:

| Time         | Vested           | Note                  |
| ------------ | ---------------- | --------------------- |
| start        | 0                | cliff active          |
| start + 1y   | 300 M (25%)      | cliff ends, jumps in  |
| start + 2y   | 600 M (50%)      |                       |
| start + 4y   | 1.2 B (100%)     | fully vested          |

**Use case:** team and advisor allocations.

## Type 2 — Stepped

`tranches` is a serialized array of `(timestamp, amount)` pairs.

```
vested = sum of t.amount for all t in tranches where t.timestamp <= now
```

Validation at creation:
- All timestamps are strictly ascending.
- All timestamps are in the future.
- Amounts sum to `totalAmount`.
- At least 1 tranche.

**Use case:** treasury releases on a quarterly schedule; partner unlocks
tied to milestones.

## Claimable

```
claimable = max(0, vested - claimedAmount)
```

`claim()` transfers `claimable` tokens to the beneficiary and updates
`claimedAmount`. If `claimable == 0`, `claim()` reverts.

## Revoke

For revocable locks the depositor can call `revoke()`:

```
returnedToDepositor = totalAmount - vestedAmount
```

`revoked` is set to `true`; the beneficiary keeps the right to call
`claim()` for the already-vested portion. Subsequent `revoke()` calls revert.
