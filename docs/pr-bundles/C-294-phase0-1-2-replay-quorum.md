# C-294 Phase 0-1-2 — Replay Quorum Contracts

## Phase
C-294 Phase 0–2 — Scope Lock + Replay Snapshot + Council Schema

## Scope
- Add ReplaySnapshot contract
- Add ReplayCouncilMessage schema
- Add read-only GET /api/system/replay/snapshot endpoint

## Files touched
- lib/system/replay-quorum.ts
- app/api/system/replay/snapshot/route.ts
- docs/pr-bundles/C-294-phase0-1-2-replay-quorum.md

## NOT touching
- Vault routes and promotion logic
- Canon API and UI
- Replay plan (Phase 5) implementation
- MIC / Fountain logic
- Ledger writes

## Change type
Additive (Phase 1–2)

## Risk
Low (read-only, no mutation)

## Validation plan
- Call /api/system/replay/snapshot?seal_id=<id>
- Verify snapshot fields align with existing Seal data
- Verify replay_snapshot_hash is stable for same seal
- Confirm no Vault/Canon/UI regression

## Notes
This PR introduces the contracts required for replay quorum without enabling any mutation or promotion. It is a prerequisite for Phase 3 (Council Bus) and Phase 4 (Quorum Evaluator).
