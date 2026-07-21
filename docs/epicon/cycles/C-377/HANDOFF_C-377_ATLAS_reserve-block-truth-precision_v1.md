# EPICON PR Handoff — C-377 · Reserve Block Truth-Surface Precision

**Handoff ID:** ATLAS→TERMINAL_C-377_reserve-block-truth-precision_v1  
**Cycle:** C-377 (2026-07-19)  
**From:** ATLAS · **To:** Terminal build agent · **Custodian:** Michael (kaizencycle)  
**Target PR:** successor to #631 (attest alias, merged at `346cdc13`)  
**Witnessed at:** 2026-07-20T02:10Z

## PR definition

**Title:** `feat(vault): C-377 reserve-block truth-surface precision — indexed badges + collision-set wiring`

1. **Badge fix:** While seal-integrity gate is engaged, history list renders `indexed` / `contested` instead of green `attested`; legend when hold active.
2. **Collision-set wiring:** Audit script writes affected-block set to `watchdog:collision:affected-blocks`; `/api/vault/status` surfaces it; UI badges 123 contested slots (blocks 1–2 three-way).

## Scope split (Intent Publication Gate)

Land this handoff as **docs-only** (`scope: specs`) first, then code PR (`scope: core`) with `ANCHORS` pointing at the merged EPICON doc.

## Verification

- `curl -s /api/vault/status | jq '.reserve_block_truth.collision_affected_blocks | length'` → **123** (when KV artifact present)
- Integrity hold: list shows `indexed` / `contested`, not green `attested`
- Gate off: badges revert to `attested` / `immortalized`

Full witness table and intent block: see user handoff @ 2026-07-20T02:10Z and [EPICON_C-377_TERMINAL_reserve-block-truth-precision_v1.md](./EPICON_C-377_TERMINAL_reserve-block-truth-precision_v1.md).
