# Track R Execution Witness Requirements (C-403)

**Status:** Required before production KV mutation — **NOT satisfied by this dry-run package.**

---

## Problem

Public APIs expose the live collision **count** (125 pairs) but not every seal body used by Track R. The pinned Substrate witness fixtures verify strategy coherence in dry-run, not that every candidate hash in the proposed manifest matches production KV at execution time.

**Collision count match alone is insufficient for execution authorization.**

---

## Requirement

Before Track R batch commit, an operator with **authenticated read-only KV access** must:

1. Export every seal body referenced by Track R (all witness collision candidates + canonical selections).
2. Compare each live KV `seal_hash` against the pinned witness `original_hashes` / fixture evidence.
3. Produce a per-record equality report with status per seal:
   - `match` — live body hash equals pinned witness expectation
   - `mismatch` — live body differs from pinned witness
   - `missing` — seal ID absent from live KV export
4. Mark export `export_complete: true` only when all Track R relevant seal IDs are present.
5. Attach the export to the execution handoff with the same `capture_id` as the lineage snapshot attestation.

---

## Commit guard integration

`assertBatchCommitAllowed` requires:

- `fresh_lineage_snapshot_hash_matches: true` — CAS gate on lineage fields only
- `pinned_witness` matching `manifest.source_audit_hash` — authoritative seal universe (~248 IDs)
- `live_seal_witness_export` verified via `verifyLiveSealWitnessExport` with that universe — per-record body equality, not collision count alone

Accumulator drift (`telemetry_snapshot_hash`) remains **informational only** and must not block CAS.

---

## Schema

See `LiveSealWitnessExport` in `lib/watchdog/batchRepair/executionWitness.ts`.

---

## This dry-run package

- `live_seal_witness_export`: **null** (not performed — public APIs insufficient)
- `execution_authorized`: **false**
- `executive_status`: **CLARIFY**

Execution remains prohibited until a fresh authenticated export satisfies the above.
