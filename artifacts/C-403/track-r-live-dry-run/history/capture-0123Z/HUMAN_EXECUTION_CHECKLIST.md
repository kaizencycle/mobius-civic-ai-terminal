# Human Execution Checklist — Track R (pre-mutation)

Do **not** authorize production mutation until all items are checked.

## Required named approvals

- [ ] Capture ID: `track-r-c403-2026-08-15T0123Z`
- [ ] Production KV identity receipt hash: `fc84f950ed17d3863e2f7d24eac6eb3c54a7434913a47aa49c7374cce296726e`
- [ ] Production witness seal hash pin hash: `3876419a2ff46df126b0b956bca96ddfc21b45d5c9f1ab3d8e21bfaa4c5f9b5e`
- [ ] Lineage snapshot hash (CAS): `3db4832725df8d3d49942e60dc9ddd00d436fdb741329362b6eb4d6753669af5`
- [ ] Semantic manifest hash: `27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa`
- [ ] Execution witness hash: `f35ef3c048cbf2f8ea93d4b29cd10c193627aaa1ce17b6cf3b50374348052867`
- [ ] Rollback manifest hash: `0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d`
- [ ] Promoted through position 131 only; 132–194 verified_unattached
- [ ] Exact live affected-block set matches pinned universe
- [ ] Authenticated live seal witness export (per-record equality, not count alone)
- [ ] Package `execution_witness.comparison_mode` is `pinned_production_witness_seal_hashes`

## Governance gates

- [ ] ZEUS ADOPT for exact four-hash packet
- [ ] EVE ADOPT for exact four-hash packet
- [ ] Fresh lineage snapshot hash matches (telemetry drift allowed)
- [ ] Live seal witness export verified (zero mismatch/missing/unexpected)
- [ ] Contract tests + typecheck + build pass
- [ ] Human custodian review recorded

## Explicit prohibitions (this PR)

- [ ] No production KV mutation
- [ ] No integrity gate clearing
- [ ] No seal candidate formation

**Human consent signature / date:** _pending_
