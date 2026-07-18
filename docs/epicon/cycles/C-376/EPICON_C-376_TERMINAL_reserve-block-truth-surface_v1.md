# EPICON_C-376_TERMINAL_reserve-block-truth-surface_v1

**Cycle:** C-376  
**Scope:** core  
**Status:** published (PR #630)

## Intent publication

```intent
epicon_id: EPICON_C-376_TERMINAL_reserve-block-truth-surface_v1
ledger_id: mobius:kaizencycle
scope: core
mode: normal
issued_at: 2026-07-18T13:28:00Z
expires_at: 2026-10-18T13:28:00Z
justification: |
  VALUES INVOKED: integrity, observability, custodianship
  REASONING: Terminal Vault UI conflated vault seal-index cardinality with reconciled
  canonical Reserve Blocks after C-370/C-373 collision audit. Gate-off must not imply
  canon. Truth surface separates index records, collision pairs, era classes, and
  operational projected accumulator slot from adjudicated continuity.
  ANCHORS:
  - docs/epicon/cycles/C-376/RESERVE_BLOCK_TRUTH_SURFACE.md
  - lib/vault/reserve-block-truth.ts
  - app/api/vault/status/route.ts
  BOUNDARIES: Does not disable SEAL_INTEGRITY_GATE. Does not mutate production KV.
  Does not apply Track R reconciliation receipts. Does not renumber historical seals.
  COUNTERFACTUAL: If Track R publishes CanonicalCountEvidence, canonical_reserve_blocks
  resolves without auto-promoting index records when gate disengages.
counterfactuals:
  - If collision pairs clear and reconciled evidence is published, formation may resume without equating seals_count to canon
  - If operators see stale headlines, verify /api/vault/status reserve_block_truth on preview deployment
```
