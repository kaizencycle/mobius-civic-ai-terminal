# Track R P3 One-Shot Execution Handoff — Template (UNSIGNED)

**Cycle:** C-404 / C-405

> **THIS TEMPLATE IS UNSIGNED.** Do not treat it as execution authorization.
> P3 handoff is issued only after P2 is deployed and fresh preflight passes at the mutation window.

---

## Required bindings

- **capture_id:** `track-r-c403-2026-08-15T2014Z`
- **semantic_manifest_hash:** `27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa`
- **lineage_snapshot_hash:** `b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb`
- **execution_witness_hash:** `e08999decbcdaaac06d91a9a11f06e6737756a646800db90ad8e57b865c1ccf1`
- **rollback_manifest_hash:** `0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d`
- **deployed_commit:** _(exact production commit SHA at mutation window)_
- **mutation_journal_id:** _(from preflight dry-run / operator packet)_

## One-shot authorization marker (required in signed file)

```
ONE_SHOT_EXECUTION_AUTHORIZED
one_shot_execution_authorized: true
```

## Signed artifact path

When issued, save as:

`artifacts/C-404/track-r-lineage-v2/TRACK_R_V2_EXECUTION_HANDOFF_SIGNED.md`

## Explicit non-authorization

This template does **not** authorize mutation. Signed governance triad and `awaiting_execution_handoff` do **not** substitute for this file.

Production mutation additionally requires:

- `TRACK_R_BATCH_EXECUTION_ENABLED=true`
- `TRACK_R_ALLOW_PRODUCTION_WRITES=true`
- `pnpm track-r:batch-apply --apply --explicit-operator-command`
- Fresh live CAS match at apply boundary
- ZEUS / EVE / human post-write confirmation
