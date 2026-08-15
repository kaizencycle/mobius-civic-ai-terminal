# Track R Lineage CAS Stability Investigation

**Date:** 2026-08-15  
**Disposition:** Capture #6 collected; execution blocked; **do not attest Capture #6 yet**  
**Primary finding:** CAS hash function is deterministic; drift is caused by **non-lineage fields bound into the lineage snapshot**

---

## Three observed lineage hashes

| Observation | Time (UTC) | Lineage CAS | Notes |
|---|---|---|---|
| Capture #5 (attested) | 01:23 | `3db48327…3669af5` | Canonical governance binding |
| Preflight probe | 16:56 | `d0880d29…d7f8845` | Failed CAS vs Capture #5 |
| Capture #6 | 17:06 | `88b60b24…e5caa4` | Read-only evidence; not attested |

Semantic manifest (`27c94b0f…`), rollback manifest (`0a61a3ff…`), and affected block set remained stable across all three.

---

## Field-level three-way comparison

Script: `pnpm track-r:lineage-cas-compare`

Committed evidence paths:

- Capture #5: `artifacts/C-403/track-r-live-dry-run/history/capture-0123Z/`
- Capture #6: `artifacts/C-403/track-r-live-dry-run/history/capture-1706Z/` (read-only; not attested)

### Capture #5 vs Capture #6 (capture path)

Only two lineage input fields differ:

| Field | Capture #5 | Capture #6 |
|---|---|---|
| `capture_id` | `track-r-c403-2026-08-15T0123Z` | `track-r-c403-2026-08-15T1706Z` |
| `cycle` | `C-403` | `C-404` |

All lineage-class fields unchanged:

- `latest_attested_seal`: `seal-C-372-002`
- `attested_seal_index`: 360
- `historical_collision_pairs`: 125
- `contested_block_positions`: 123
- witness/resolution hashes: unchanged
- affected block set: exact match
- integrity gate: active
- lineage pointers: null/null

### Preflight (16:56) vs Capture #6 (~10 min later)

Simulated preflight input from Capture #6 production baseline **exactly reproduces** reported preflight hash `d0880d29…`.

Only one field differs between simulated preflight and Capture #6:

| Field | Preflight | Capture #6 |
|---|---|---|
| `capture_id` | `track-r-c403-2026-08-15T0123Z` (attested) | `track-r-c403-2026-08-15T1706Z` |

**Normalization:** Setting Capture #6 `capture_id` to attested `0123Z` yields preflight hash exactly.

### Capture #5 vs Preflight (16:56)

Single-field attribution from Capture #5 baseline:

| Field flipped | Resulting hash | Matches |
|---|---|---|
| `cycle` → `C-404` | `d0880d29…` | Preflight ✓ |
| `capture_id` → `1706Z` | `95f3e085…` | Neither |

**Conclusion:** Preflight drift from Capture #5 is entirely explained by operator cycle **label** advance (`C-403` → `C-404`) without seal-body or affected-set change.

---

## Ruled out (option 2 — nondeterministic CAS)

| Suspected source | Verdict |
|---|---|
| `captured_at` / watchdog timestamps | **Not in lineage hash** (telemetry only) |
| Accumulator MIC / GI | **Telemetry hash only** — drift observed, correctly excluded |
| Array/object ordering | **Ruled out** — `stableHash.ts` canonical key sort |
| Rolling API fields in lineage | **Not bound** except `cycle` label |
| Witness ordering | Execution witness sorts seal IDs; lineage uses hashes only |
| Capture vs preflight path divergence | **Ruled out** at same baseline — hashes match when inputs match |
| Lineage pointer observation | Both null at 16:56 and 17:06 |

---

## Back-to-back capture stability (simulated)

Workflow dispatch from cloud agent returned HTTP 403 (insufficient Actions scope).

**Deterministic reproduction:** Two read-only captures against identical production state will produce **different lineage hashes today** because `capture_id` is hashed into the lineage snapshot. Capture #6 vs normalized Capture #6 (same baseline, attested capture_id) demonstrates this without a second live run.

---

## Execution witness hash cascade

Capture #5 execution witness: `f35ef3c0…`  
Capture #6 execution witness: `90bd7b15…`

Live witness comparison: 248/248 MATCH in both captures. Witness hash drift is a **downstream effect** of lineage hash including `capture_id` (execution witness input binds `lineage_snapshot_hash`).

---

## Required CAS repair

Remove from `LineageSnapshotInput`:

1. **`capture_id`** — packet identity, not production lineage; forces every capture to diverge
2. **`cycle`** — operator cycle label; advanced C-403→C-404 with no seal-body change

Move `operator_cycle` to telemetry snapshot for observability.

After repair, attested Capture #5 lineage hash **must be recomputed** and governance must re-bind before execution authorization.

---

## Current disposition

| Item | Status |
|---|---|
| Capture #6 attestation | ⛔ Blocked |
| Track R execution | ⛔ Not authorized |
| CAS root cause | ✅ Identified — structural, not flaky |
| CAS code repair | Required before new attestation |
| Governance restart | Required after hash formula fix |
