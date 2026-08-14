# ATLAS × ZEUS × EVE Handoff — C-403 Track R Batch Repair Engine

**Cycle:** C-403  
**Repair ID:** `track-r-c403-batch-001`  
**EPICON:** `EPICON_C-403_CORE_track-r-batch-engine_v1`  
**Terminal PR:** `fix(C-403): Track R batch collision repair engine`  
**Mode:** Dry-run only — production execution **FORBIDDEN**  
**Risk:** EP-3

---

## Mission summary

Terminal has implemented a fail-closed, batch-atomic Track R repair **engine** that:

- Generates 123 reconciliation receipts from the pinned C-397 witness and C-401 resolution table
- Quarantines 125 conflicting seal IDs as witnesses (zero deletions)
- Stages a versioned canonical map (in-memory / fixture tests only)
- Produces a deterministic batch manifest and dry-run report
- Implements a future commit guard (not invoked)

This handoff package is for the subsequent **Substrate ZEUS × EVE adjudication PR**. Terminal does not pre-fill verdicts.

---

## Pinned evidence (Terminal fixtures)

| Artifact | Path | SHA256 (see provenance) |
|---|---|---|
| C-397 witness | `docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json` | `4099b5a4…` |
| C-401 resolution table | `docs/epicon/cycles/C-403/fixtures/C403_COLLISION_RESOLUTION_TABLE.pin.json` | `90296f11…` |
| Provenance | `docs/epicon/cycles/C-403/fixtures/C403_FIXTURE_PROVENANCE.json` | — |
| Sample dry-run report | `docs/epicon/cycles/C-403/fixtures/C403_BATCH_DRY_RUN_REPORT.sample.json` | fixture-only |

Substrate source commit: `7956e7b9a34b91973c567fec77c9aed6d30839d8`

---

## Batch manifest (fixture dry-run)

| Field | Value |
|---|---|
| `repair_id` | `track-r-c403-batch-001` |
| `cycle` | `C-403` |
| `strategy` | `component_coherent_hybrid` |
| `manifest_hash` (fixture) | `274ac2464f4c015170f0ad86a9c2259f7eb0a4a654a32a9c0fb2621e1c5a8390` |
| `production_execution_enabled` | `false` |
| `zeus_verdict` | `pending` |
| `eve_verdict` | `pending` |
| `human_approval` | `pending` |

Counts enforced by validator:

- 194 total block positions
- 123 contested positions
- 125 historical hash-divergent pairs
- 125 quarantined conflicting seal IDs
- 123 canonical assignments
- 71 clean positions unchanged

Boundaries:

- `41->42`: `must_pass` (segment-local continuity verified in dry-run)
- `131->132`: `pending_track_r_step_8` (must **not** be falsely passed)

---

## ZEUS review contract

ZEUS must verify:

1. All 123 receipts match fresh audit evidence (when run against live KV in a later phase).
2. All 125 conflicting seals remain retrievable as quarantined witnesses.
3. Every canonical choice matches the approved C-401 resolution table — no engine inference.
4. Batch `manifest_hash` is deterministic (stable serialization + SHA256).
5. KV snapshot has not changed between audit and manifest creation.
6. Dry run is idempotent (repeated runs produce identical hash).
7. Segment-local continuity 41→42 passes.
8. 131→132 remains explicitly deferred — not resolved in this batch.
9. Rollback restores derived state without deleting historical evidence.
10. No execution path can run without the exact approved `manifest_hash`.
11. Raw historical collision evidence remains visible (historical count stays 125).

**ZEUS returns:** `ADOPT` | `CHALLENGE` | `OVERTURN`

---

## EVE review contract

EVE must verify:

1. No seal evidence is destroyed.
2. Losing branches are quarantined as witnesses, not deleted.
3. Canonicalization does not rewrite who performed an action.
4. MIC balances are not retroactively recalculated.
5. No recognition or reward is revoked solely because a branch loses canonical status.
6. The repair changes derived interpretation, not historical fact.
7. Human consent is required before commit.
8. Fountain, Block 361, and integrity-gate decisions remain separate.
9. Rollback preserves institutional memory (receipts, manifests, journals retained).

**EVE returns:** `ADOPT` | `CHALLENGE` | `OVERTURN`

---

## Human decisions still required

1. Review batch manifest hash and sample dry-run report.
2. Confirm canonical selections align with custodian-approved `component_coherent_hybrid` strategy.
3. Explicitly approve before any future `--apply` or production activation.
4. Authorize exact `manifest_hash` for commit guard.
5. Separate decisions remain for Track R step 8 (131→132 / `.dat` / Fountain / Block 361).

---

## Architecture delivered (Terminal)

| Component | Path |
|---|---|
| Batch manifest schema | `lib/watchdog/batchRepair/types.ts` |
| Deterministic builder | `lib/watchdog/batchRepair/buildBatchManifest.ts` |
| Fail-closed validator | `lib/watchdog/batchRepair/validateBatchManifest.ts` |
| Versioned staging | `lib/watchdog/batchRepair/versionedStaging.ts` |
| Dry-run executor | `lib/watchdog/batchRepair/dryRunExecutor.ts` |
| Commit guard | `lib/watchdog/batchRepair/commitGuard.ts` |
| Rollback plan | `lib/watchdog/batchRepair/rollbackPlan.ts` |
| Audit metrics | `lib/watchdog/batchRepair/auditMetrics.ts` |
| CLI (dry-run default) | `scripts/watchdog-batch-collision-repair.ts` |
| Contract tests | `tests/contract/batchCollisionRepair.test.ts` |

---

## Unresolved risks / blockers for future commit phase

1. **Upstash atomicity:** Version-pointer CAS is supported; 123-key block mutation is not atomic without Lua — activation must use `watchdog:lineage:active_version` only.
2. **Live KV dry-run:** This PR uses pinned fixtures; live production dry-run requires operator credentials and fresh audit in a later gated phase.
3. **131→132 boundary:** Explicitly deferred; full single-chain 1–194 continuity is not claimed until Track R step 8.

---

## What this PR does NOT contain

- Production KV mutations
- Approved ZEUS/EVE verdicts
- Human approval
- Substrate canon changes
- Civic Core ledger writes
- Gate-lift logic
- Automatic execution wiring

---

No production KV mutation performed. No original seal deleted. No Track R promotion executed. No integrity gate lifted. Execution remains disabled. ZEUS, EVE and human approval remain pending.

*"We heal as we walk." — Mobius Systems*
