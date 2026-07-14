---
epicon_id: EPICON_C-371_INFRA_replay-canon-anchors_v1
title: "Replay canon anchors from cold MANIFEST — C-371"
author_name: "Michael Judan (custodian)"
cycle: "C-371"
tier: "INFRA"
scope:
  domain: "infra"
  system: "civic-ai-terminal"
  environment: "mainnet"
epicon_type: "implementation-intent"
status: "proposed"
related_prs:
  - "https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/621"
related_epicons:
  - "EPICON_C-371_PROPOSAL_reserve-block-ui-verified-truth_v1"
tags:
  - "canon"
  - "cpc"
  - "anchor"
  - "remediation"
  - "reserve-blocks"
created_at: "2026-07-14T16:55:00Z"
summary: "Operator script and workflow to POST cold Substrate MANIFEST hashes to CPC without KV re-export, after canon routes are live."
---

# EPICON C-371 — Replay canon anchors

**Prerequisite:** CPC redeployed with canon routes live (`check_deploy_drift.py` exit 0). Depends on merged #620 (`resolveCpcBaseUrl`).

## Artifacts

| Path | Role |
|------|------|
| `scripts/replay-canon-anchors.mjs` | Read Substrate `MANIFEST.json`, POST each file to `/api/canon/reserve-blocks/anchor` |
| `.github/workflows/replay-canon-anchors.yml` | Manual `workflow_dispatch` with `CPC_BASE_URL` + `AGENT_SERVICE_TOKEN` secrets |

---

```intent
epicon_id: EPICON_C-371_INFRA_replay-canon-anchors_v1
ledger_id: kaizencycle
scope: infra
mode: normal
issued_at: 2026-07-14T16:55:00Z
expires_at: 2026-07-28T16:55:00Z
justification:
  VALUES INVOKED: integrity, witness, non-fabrication
  REASONING: Live CPC returned 404 on canon manifest routes while cold Substrate MANIFEST (blk0000.dat, blk0001.dat, tip sha256:2ccc5e41…) held authoritative hashes. Vault UI correctly showed zero canon because CPC had no anchored state. This intent adds operator replay tooling to POST cold MANIFEST entries to CPC after redeploy without re-exporting from KV — closing the immortalization gap between Git cold canon and CPC live anchors.
  ANCHORS:
    - docs/epicon/cycles/C-371/REMEDIATION_C-371_reserve-block-canon-immortalization.md
    - docs/epicon/cycles/C-371/EPICON_C-371_INFRA_replay-canon-anchors_v1.md
    - scripts/replay-canon-anchors.mjs
    - lib/cpc/hashAnchor.ts
    - Mobius-Substrate/canon/reserve-blocks/MANIFEST.json
  BOUNDARIES: Script and workflow only. Does not provision Render Postgres, redeploy CPC, or resolve Q3 block_number_collisions. Does not re-export blocks 195–359 from KV. Requires AGENT_SERVICE_TOKEN and live canon routes before non-dry-run execution.
  COUNTERFACTUAL: If Intent Publication Gate rejects this block, correct scope and I6 fields per EPICON-02 before merge.
counterfactuals:
  - If CPC returns 409 CONFLICT for an anchor, treat as idempotent success after verifying hash matches MANIFEST.
  - If canon routes still 404, abort and complete CPC redeploy before replay — script manifest probe will warn.
  - If AGENT_SERVICE_TOKEN missing, use DRY_RUN=1 to validate payloads locally.
```
