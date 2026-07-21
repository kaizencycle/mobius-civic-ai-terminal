# EPICON_C-377_TERMINAL_reserve-block-truth-precision_v1

**Cycle:** C-377  
**Scope:** core (code PR) / specs (this doc)  
**Status:** published (handoff)

## Intent publication

```intent
epicon_id: EPICON_C-377_TERMINAL_reserve-block-truth-precision_v1
ledger_id: mobius:kaizencycle
scope: core
mode: normal
issued_at: 2026-07-20T02:10:00Z
expires_at: 2026-10-18T02:10:00Z
justification: |
  VALUES INVOKED: integrity, observability, custodianship
  REASONING: Operationalize the C-377 collision audit (125 hash-divergent
  pairs across 123 unique block_numbers; CI run 29710940106) on the live
  vault truth surface. Today the Reserve Block history list badges all
  historical slots "attested" while the summary withholds canonical status
  — the list over-claims what the summary denies. This change (a) collapses
  historical badges to "indexed" while the integrity gate is engaged, and
  (b) threads the collision-audit affected-block set through
  /api/vault/status so the 123 contested slots render as contested and the
  71 clean cold-canon slots remain eligible. Display-only surface honesty.
  ANCHORS:
  - docs/epicon/cycles/C-377/HANDOFF_C-377_ATLAS_reserve-block-truth-precision_v1.md
  - lib/vault/collision-affected-blocks.ts
  - lib/vault/reserve-block-rows.ts
  BOUNDARIES: No KV mutation. No seal-integrity gate change. No Track R
  receipt application. No .dat export under Gate G. No GI-by-fiat. No MIC
  issuance change. Dedupe membership is READ from the audit artifact,
  never recomputed in the UI (no UI-derived truth).
  COUNTERFACTUAL: If the collision-audit set is not yet on a live-readable
  path, ship the gate-driven list-wide "indexed" default only and defer
  per-slot precision.
counterfactuals:
  - If the collision-audit set is not yet on a live-readable path, ship the
    gate-driven list-wide "indexed" default only and defer per-slot precision.
  - If Guard flags scope union (docs/epicon + app/lib), split per handoff.
  - Do NOT merge if it would badge specific slots from a stale point-in-time
    artifact rather than the current audit output.
```

## Witness anchors

| Field | Value |
|---|---|
| Collision pairs | 125 (`hash_divergent_collisions`) |
| Unique contested blocks | 123 |
| Three-way blocks | 1–2 |
| Clean cold-canon slots | 34–41, 132–194 (71 slots) |
| CI witness | run `29710940106` |
| KV artifact key | `watchdog:collision:affected-blocks` |

## Restraint row

- No seal body mutation
- No Track R receipt apply
- No `shouldSealIntegrityGateBeActive` changes
- Audit script `--write-kv` is operator tooling only; not invoked by PR deploy
