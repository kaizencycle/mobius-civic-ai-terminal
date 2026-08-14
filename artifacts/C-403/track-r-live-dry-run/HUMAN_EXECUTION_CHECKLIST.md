# Human Execution Checklist — Track R (pre-mutation)

Do **not** authorize production mutation until all items are checked.

## Required named approvals

- [ ] Snapshot hash: `55ca67b53f30c4d3599ea0e26ceae07adba833537e79df3930fd90afc8040c12`
- [ ] Manifest hash: `2e3a6c98f88884a1ece052e5c9780862b26a97108bd3648409986d4b3d392075`
- [ ] Rollback manifest hash: `0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d`
- [ ] Expected KV version prefix: `watchdog:lineage:version:track-r-c403-batch-001:`
- [ ] Mutation scope: 123 contested positions adjudicated; 125 witnesses quarantined; 71 clean unchanged
- [ ] Boundary 131→132 disposition explicitly approved or deferred

## Governance gates

- [ ] ZEUS ADOPT recorded for exact manifest hash above
- [ ] EVE ADOPT recorded for exact manifest hash above
- [ ] Fresh live snapshot matches attested snapshot hash (re-capture immediately before execution)
- [ ] Rollback manifest verified complete
- [ ] Contract tests + typecheck + build pass on execution handoff branch

## Explicit prohibitions (this PR)

- [ ] No production KV mutation in this evidence PR
- [ ] No integrity gate clearing
- [ ] No seal candidate formation

**Human consent signature / date:** _pending_
