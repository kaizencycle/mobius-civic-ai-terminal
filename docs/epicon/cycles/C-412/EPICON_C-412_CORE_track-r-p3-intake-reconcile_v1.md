# EPICON_C-412_CORE_track-r-p3-intake-reconcile_v1

**Cycle:** C-412  
**Scope:** core  
**Status:** published — non-executable intent  
**Authority:** intake projection repair only; `execution_authorized: false`

---

```intent
epicon_id: EPICON_C-412_CORE_track-r-p3-intake-reconcile_v1
ledger_id: kaizencycle
scope: core
mode: normal
issued_at: 2026-08-23T16:30:00Z
expires_at: 2026-11-23T16:30:00Z

justification:
  VALUES INVOKED: Operator truth over illusion; fail-closed custodianship; provenance before execution.
  REASONING: Production p3-intake-status returned NOT_SEEN with stale run 32264177719 because observability hardcoded a canonical run and the committed issued-packet registry was not visible in the deployed serverless bundle. Latest packet 32650057599 exists on main but production remained on 76f39ba without registry packaging or KV authority. Reconcile intake to resolve latest issued packet from KV-first registry with committed fallback, remove stale run defaults, bundle evidence paths for serverless tracing, and sync registry to KV after P3 preparation.
  ANCHORS:
    - lib/trackR/p3IntakeObservability.ts
    - lib/watchdog/batchRepair/p3IssuedPacketRegistryStore.ts
    - docs/epicon/cycles/C-407/p3-preparation/issued-packet-registry.json
    - docs/epicon/cycles/C-407/p3-preparation/runs/32650057599/operator-packet.md
  BOUNDARIES: Intake projection and registry visibility only. No Reserve Block mutation, no execution handoff, no lineage pointer writes, no block 132-194 scope expansion, no execution_authorized true.
  COUNTERFACTUAL: If production still cannot resolve packet 32650057599 after deploy and KV sync, halt Track R and do not issue execution handoff. If deploy changes production commit, refresh CAS before any execution discussion.

counterfactuals:
  - If intake still reports NOT_SEEN for 32650057599 after KV sync, block governance progression and inspect registry source precedence.
  - If CAS identity shifts after deploy, re-run execution-readiness and batch-apply-preflight before handoff discussion.
  - Rollback is git revert of intake/registry modules only; no KV mutation cleanup required beyond optional registry resync.
```

---

## Summary

Reconciles Track R P3 intake observability with the current issued-packet registry so production can see packet `32650057599` without fabricating governance receipts.

## Rollback

```bash
git revert <commit-sha>
pnpm track-r:sync-p3-issued-registry-kv  # optional re-sync after revert
```
