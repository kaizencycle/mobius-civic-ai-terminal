# Operator Runbook — C-403 Track R Batch Collision Repair Engine

**Read first:** `docs/epicon/cycles/C-403/EPICON_C-403_CORE_track-r-batch-engine_v1.md`

**Mode:** Build, test, and dry-run only. Production execution is **FORBIDDEN** in this cycle phase.

---

## Phase 0 — Preflight (no mutations)

1. Read `AGENTS.md`, `BUILD.md`, and this runbook.
2. Confirm Substrate PR #436 (federation reconciliation) is merged.
3. Confirm pinned fixture counts match witness:
   - 194 total block positions
   - 123 contested positions
   - 125 historical hash-divergent pairs
   - 125 quarantined conflicting seal IDs
   - 123 canonical assignments
   - 71 clean positions
4. Confirm `C403_COLLISION_RESOLUTION_TABLE.pin.json` has:
   - `strategy: component_coherent_hybrid`
   - `approval_status: pending_zeus_and_eve_attestation`
5. Confirm `SEAL_INTEGRITY_GATE` is **not** `off`.
6. Do **not** use production credentials for tests or fixture dry-runs.

Fixture paths (Terminal repo):

```
docs/epicon/cycles/C-403/fixtures/C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json
docs/epicon/cycles/C-403/fixtures/C403_COLLISION_RESOLUTION_TABLE.pin.json
docs/epicon/cycles/C-403/fixtures/C403_FIXTURE_PROVENANCE.json
```

---

## Phase 1 — Understand the single-receipt circular dependency

The legacy path (`prepareCollisionRepair` in `lib/watchdog/collisionRepairTransaction.ts`) validates each receipt against the **current** canonical map. For contested block 1, blocks 2–131 remain unresolved, so the first single-receipt repair fails.

The batch engine resolves all 123 contested positions together via a cumulative `pendingCanonical` overlay during dry-run simulation. The CLI confirms this:

```bash
pnpm watchdog:batch-collision-repair
```

Expected output includes:

```
Single-receipt circular dependency: confirmed
```

---

## Phase 2 — Fixture dry-run (default; zero writes)

```bash
pnpm watchdog:batch-collision-repair
pnpm watchdog:batch-collision-repair --out artifacts/C-403/batch-dry-run-report.json
```

- Default mode is dry-run. **No `--apply` flag exists** (passing `--apply` exits with code 2).
- Writes sample report to `docs/epicon/cycles/C-403/fixtures/C403_BATCH_DRY_RUN_REPORT.sample.json` when `--out` is omitted.
- Records `manifest_hash`, adjudication metrics, staged lineage view, and rollback plan.

Post-repair metrics semantics (historical count **remains** 125):

```json
{
  "historical_hash_divergent_pair_count": 125,
  "adjudicated_collision_positions": 123,
  "unresolved_collision_positions": 0,
  "canonical_assignment_count": 123,
  "quarantined_witness_count": 125,
  "original_seals_deleted": 0,
  "clean_positions_modified": 0,
  "boundary_41_42": "pass",
  "boundary_131_132": "pending_track_r_step_8"
}
```

---

## Phase 3 — Contract tests

```bash
pnpm exec tsx tests/contract/batchCollisionRepair.test.ts
pnpm exec tsx tests/contract/trackRFailClosed.test.ts
pnpm exec tsx tests/contract/collisionAffectedBlockPersist.test.ts
pnpm test
```

Contract tests cover receipt generation, quarantine, validation, commit guard, dry-run idempotency, boundaries, rollback, fail-closed executive status, and production KV identity receipt.

---

## Phase 4 — Governance gates (not in this PR)

Before any future production commit, all must pass:

| Gate | Status in this PR |
|---|---|
| ZEUS technical ADOPT | `pending` |
| EVE governance ADOPT | `pending` |
| Michael human approval | `pending` |
| Exact approved `manifest_hash` | not set |
| `TRACK_R_BATCH_EXECUTION_ENABLED=true` | not set |
| Explicit operator command | not invoked |
| Fresh KV snapshot matches manifest | operator verifies at commit time |
| Integrity gate active | required at commit time |
| Mutation journal available | required at commit time |
| Rollback plan verified | required at commit time |

---

## Phase 4b — Production evidence capture (post PR #656, read-only)

**Option B (automatic observability):** `kv-watchdog` cron refreshes `watchdog:collision:affected-blocks` from primary Upstash every 10 minutes when KV is healthy (including cleared/empty snapshots when collisions resolve). `/api/vault/status` reads the snapshot via primary-only loader.

**Option A (gated operator / GHA — read-only witness capture):**

```bash
# Local — production KV_REST_API_* in .env.local (never commit)
pnpm track-r:production-capture

# GitHub Actions — workflow_dispatch (recommended)
# Actions → Track R Production Capture → Run workflow
# Requires repo secrets: KV_REST_API_URL, KV_REST_API_TOKEN
```

Handoff: `docs/epicon/cycles/C-403/HANDOFF_C-403_PRODUCTION_KV_WITNESS_CAPTURE.md`

Capture performs **zero production KV writes**. Steps:

1. Prove production KV identity (`TRACK_R_KV_IDENTITY_RECEIPT.json`)
2. Load authoritative live affected-block set (watchdog snapshot → primary derivation)
3. Export complete expected seal universe from primary KV
4. Verify live boundary 41→42 and preserve 131 cutoff
5. Emit four-object attestation packet (execution witness hash binds identity receipt)

Success target:

- `executive_status: READY_FOR_ZEUS_EVE_REVIEW`
- `execution_witness_hash` non-null
- `affected_block_comparison.set_match: true`
- witness export: matched = expected universe, mismatched/missing/unexpected = 0
- process exit 0

Until then: **NOT AUTHORIZED** — do not enable execution flags.

---

## Phase 4c — Attestation PR (after READY only)

Only when Phase 4b returns `READY_FOR_ZEUS_EVE_REVIEW`:

1. Download GHA artifact `track-r-production-capture` (30-day retention).
2. Open a **draft attestation PR** containing:
   - `TRACK_R_KV_IDENTITY_RECEIPT.json`
   - `TRACK_R_AFFECTED_BLOCK_COMPARISON.json`
   - `TRACK_R_LIVE_WITNESS_COMPARISON_REDACTED.json`
   - `TRACK_R_LIVE_DRY_RUN_PACKAGE.json`
   - Updated unsigned `ZEUS_ATTESTATION_TEMPLATE.md`, `EVE_ATTESTATION_TEMPLATE.md`, `HUMAN_EXECUTION_CHECKLIST.md`
3. Route to ZEUS × EVE adjudication (`HANDOFF_C-403_ZEUS_EVE_track-r-batch-engine_v1.md`).
4. Require explicit human consent checklist completion.

Still **NOT AUTHORIZED** for Track R mutation until a separate one-shot execution handoff after ZEUS ADOPT + EVE ADOPT + human approval.

---

## Phase 5 — Future guarded execution (design only)

Versioned staging keys (conceptual):

```
watchdog:lineage:version:<repair_id>:manifest
watchdog:lineage:version:<repair_id>:canonical
watchdog:lineage:version:<repair_id>:quarantine
watchdog:lineage:active_version
```

Activation model:

1. Stage immutable version keys (checksum verified).
2. CAS `watchdog:lineage:active_version` once.
3. Update derived latest pointer within the same guarded transaction — or fail closed.
4. Journal immutable mutation entry.

**Upstash limitation:** 123 block keys cannot be atomically SET in one REST call without a Lua script. Production commit must use version-pointer activation, not 123 sequential block-key mutations.

Rollback restores:

- previous active lineage version
- previous latest pointer
- previous derived quarantine view
- previous canonical map selection

Rollback **never** deletes original seal records, receipts, batch manifests, or mutation-journal evidence.

---

## Stop conditions

Stop and report (do not proceed) if:

- Fresh audit differs from 125 conflicts / 123 positions
- Resolution-table hash cannot be pinned
- Canonical selections are incomplete
- Receipt counts do not reconcile
- Atomic activation cannot be guaranteed
- Production credentials are required for tests
- 131→132 is falsely represented as resolved
- Commit mode could trigger without explicit human action

---

## C-403 internal phases (no cycle advance)

```
C-403
├── Federation reconciliation — PR #436 (Substrate, merged)
├── Track R batch engine — Terminal draft PR (this work)
├── ZEUS technical adjudication — pending
├── EVE governance adjudication — pending
├── Human approval — pending
└── Guarded execution — only if every gate passes
```

C-404 begins at the next authorized daily cycle transition, not when this PR merges.

---

*"We heal as we walk." — Mobius Systems*
