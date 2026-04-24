# C-291 — Ledger Cycle + Status Normalization

## Purpose

Fix Ledger display labels after the EPICON bridge went live.

## Problem

Ledger rows were appearing as:

- `C-—` when EPICON or GitHub-derived rows did not carry an explicit `cycle` field.
- `pending` even when the event was clearly a merged GitHub pull request or verified EPICON row.

This made the Ledger lane look less canonical than the data actually was.

## Change

`app/api/chambers/ledger/route.ts` now:

- infers cycle IDs from `cycle`, `id`, `title`, `body`, `tags`, and `source`
- normalizes `C291` and `C-291` to `C-291`
- marks GitHub merge pull request rows as `committed`
- marks verified EPICON rows as `committed`
- keeps unknown rows as `pending`
- adds `sources.missingCycle` diagnostics

## Expected result

Instead of:

```txt
C-— · 18 ledger rows
Merge pull request #397... pending
```

Ledger should move toward:

```txt
C-291 · 18 ledger rows
Merge pull request #397... committed
```

## Acceptance criteria

- [x] Ledger can infer cycle from PR titles like `c291-*`.
- [x] Ledger normalizes inferred cycle to `C-291`.
- [x] GitHub merge pull request rows become `committed`.
- [x] Verified EPICON rows become `committed`.
- [x] Unknown rows remain `pending`.
- [x] Response includes `sources.missingCycle`.
