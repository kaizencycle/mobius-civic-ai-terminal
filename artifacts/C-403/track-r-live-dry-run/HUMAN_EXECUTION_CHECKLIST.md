# Human Execution Checklist — Track R (pre-mutation)

Do **not** authorize production mutation until all items are checked.

## Required named approvals

- [ ] Capture ID: `track-r-c403-2026-08-14T1952Z`
- [ ] Production KV identity receipt hash: `44081062a4e83431ce49616cd6438ccc06ef8f78c16fa78340d0fc379b54ffdc`
- [ ] Lineage snapshot hash (CAS): `080cfc83d3b9515209fe8280e7477171cd977e02879a125b751dd94fcf576507`
- [ ] Semantic manifest hash: `27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa`
- [ ] Execution witness hash: `TBD`
- [ ] Rollback manifest hash: `0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d`
- [ ] Promoted through position 131 only; 132–194 verified_unattached
- [ ] Exact live affected-block set matches pinned universe
- [ ] Authenticated live seal witness export (per-record equality, not count alone)

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
