# EPICON_C-403_CORE_track-r-batch-engine_v1

**Cycle:** C-403  
**Repair ID:** `track-r-c403-batch-001`  
**Scope:** core (Terminal watchdog batch repair engine)  
**Status:** proposed (dry-run only; execution disabled)

## Intent publication

```intent
epicon_id: EPICON_C-403_CORE_track-r-batch-engine_v1
ledger_id: kaizencycle
scope: core
mode: normal
issued_at: 2026-08-14T00:00:00Z
expires_at: 2026-11-12T00:00:00Z
justification: |
  VALUES INVOKED: integrity, provenance, custodianship, fail-closed safety
  REASONING: Track R Reserve Block collision repair requires adjudicating 123 contested
  block positions with 125 historical hash-divergent pairs as one sealed batch. The existing
  single-receipt repair path fails closed when other contested positions lack canonical
  assignments — a circular dependency. This EPICON delivers a deterministic batch manifest
  builder, versioned staging abstraction, dry-run executor, commit guard, and rollback plan
  generator so ZEUS, EVE, and the human custodian can review the complete repair before
  any production KV mutation.
  ANCHORS:
  - docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json
  - docs/epicon/cycles/C-403/fixtures/C403_COLLISION_RESOLUTION_TABLE.pin.json
  - lib/watchdog/batchRepair/
  - docs/epicon/cycles/C-401/C401_TRACK_R_PROMOTION_SOP.md (Substrate, pinned fixture)
  BOUNDARIES: No production KV mutation. No ZEUS/EVE/human approval pre-filled.
  No integrity gate lift. No Fountain unlock. No Block 361 formation. No .dat regeneration.
  No automatic execution on deploy, cron, import, or startup. Canonical selections come
  exclusively from the pinned C-401 resolution table (strategy: component_coherent_hybrid).
  COUNTERFACTUAL: If fresh audit counts differ from 125/123/71, stop and report mismatch.
  If Upstash cannot guarantee atomic version-pointer activation, document blocker and do not
  approximate atomicity.
counterfactuals:
  - If ZEUS challenges canonical selection, manifest zeus_verdict moves to challenged — no commit
  - If KV snapshot hashes change after manifest creation, dry-run and commit fail closed
  - If approved_manifest_hash differs from executing manifest, commit guard rejects
  - Rollback restores derived pointers only; never deletes original seal bodies or receipts
```

## Witness anchors

| Field | Value |
|---|---|
| Total block positions | 194 |
| Contested positions | 123 |
| Historical hash-divergent pairs | 125 |
| Quarantined conflicting seal IDs | 125 |
| Canonical assignments | 123 |
| Clean positions | 71 |
| Strategy | `component_coherent_hybrid` |
| Resolution table approval | `pending_zeus_and_eve_attestation` |
| Boundary 41→42 | `must_pass` |
| Boundary 131→132 | `pending_track_r_step_8` |
| Fixture provenance | `docs/epicon/cycles/C-403/fixtures/C403_FIXTURE_PROVENANCE.json` |

## Restraint row

- No production KV mutation in this PR
- No original seal body deletion
- No automatic gate changes
- `production_execution_enabled: false` always in manifest
- `TRACK_R_BATCH_EXECUTION_ENABLED` defaults false; commit guard required for future apply

## Proof requirements

| Artifact | Path / command |
|---|---|
| Contract tests | `pnpm exec tsx tests/contract/batchCollisionRepair.test.ts` |
| Full contract suite | `pnpm test` |
| Fixture dry-run | `pnpm watchdog:batch-collision-repair` |
| Sample report | `docs/epicon/cycles/C-403/fixtures/C403_BATCH_DRY_RUN_REPORT.sample.json` |
| Operator runbook | `docs/epicon/cycles/C-403/OPERATOR_C-403_track-r-batch-engine.md` |
| ZEUS × EVE handoff | `docs/epicon/cycles/C-403/HANDOFF_C-403_ZEUS_EVE_track-r-batch-engine_v1.md` |

---

*"We heal as we walk." — Mobius Systems*
