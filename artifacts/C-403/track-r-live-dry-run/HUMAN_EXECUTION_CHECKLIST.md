# Human Execution Checklist — Track R (pre-mutation)

Do **not** authorize production mutation until all items are checked.

## Required named approvals

- [ ] Capture ID: `track-r-c403-2026-08-14T1854Z`
- [ ] Lineage snapshot hash (CAS): `cf94116d04eec4f2b88161c142b0bbf26d3bbf734d637d888389f8f1df55e6cc`
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
