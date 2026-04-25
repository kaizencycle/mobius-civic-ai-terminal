# C-292 Ledger Cycle + EPICON Bridge

## Issue

The Ledger chamber was showing:

```txt
C-— · ledger rows
```

instead of the active cycle, even while the Terminal header showed `C-292`.

This made it look like EPICON feed rows were not posting into the Ledger or that Ledger did not understand the current cycle.

## Root cause

The Ledger page client wrapped chamber data with a hardcoded fallback:

```ts
status: { cycleId: 'C-—' }
```

The Ledger chamber API also normalized missing feed cycles to `C-—` instead of using the active deterministic cycle.

## Fix

- `app/api/chambers/ledger/route.ts`
  - imports `currentCycleId()`
  - returns `cycleId` at top-level
  - uses active cycle as fallback when EPICON feed rows lack cycle metadata
  - preserves inferred cycles when rows include `C-###` in id/title/body/tags

- `hooks/useLedgerChamber.ts`
  - adds `cycleId` to `LedgerChamberPayload`
  - preview rows inherit active cycle from digest/snapshot

- `app/terminal/ledger/LedgerPageClient.tsx`
  - renders active cycle from chamber payload instead of hardcoded `C-—`

## Expected result

Ledger chamber should display:

```txt
C-292 · 11 ledger rows
```

or the current deterministic cycle for the day.

EPICON feed bridge rows will still be visible as candidates/committed rows, but now they carry an active cycle when the source does not include explicit cycle metadata.

## Canon

Ledger rows without explicit cycle metadata should inherit the active cycle, not lose cycle awareness.

EPICON feeds the Ledger chamber.
Ledger chamber shows the current cycle.
Proof remains human-merge aware.

We heal as we walk.
