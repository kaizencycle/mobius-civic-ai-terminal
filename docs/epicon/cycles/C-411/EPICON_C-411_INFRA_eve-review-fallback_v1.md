# EPICON_C-411_INFRA_eve-review-fallback_v1

**Cycle:** C-411  
**Scope:** infra  
**Status:** published — non-executable intent  
**Authority:** implementation handoff only; `execution_authorized: false`

---

```intent
epicon_id: EPICON_C-411_INFRA_eve-review-fallback_v1
ledger_id: kaizencycle
scope: infra
mode: normal
issued_at: 2026-08-23T01:30:00Z
expires_at: 2026-11-23T01:30:00Z

justification:
  VALUES INVOKED: Operator truth over illusion; EVE must not silently approve high-risk change; fail-closed custodianship for PR governance review.
  REASONING: Sentinel Review previously skipped PRs labeled needs-custodian-review and converted missing providers or parse failures into passing verdicts. JOB-4 removes fail-open paths, adds an explicit EVE civic-risk lane, surfaces degraded/unavailable states, and routes unresolved EVE review to ZEUS plus human review without fabricating independent EVE attestation.
  ANCHORS:
    - .github/workflows/sentinel-review.yml
    - lib/governance/sentinelReviewPolicy.ts
    - lib/agents/registry.ts (EVE forbidden: silently_approve_high_risk_change)
    - docs/epicon/cycles/C-408/C408_ATLAS_HANDOFF.md (governance review lane semantics)
  BOUNDARIES: Workflow and policy-module changes only. No GI/MIC/MII mutation, no Vault/Reserve Block/seal quorum changes, no production/KV writes, no batch-apply or Track R execution authority, no impersonation of EVE via shared-provider fallback as independent quorum.
  COUNTERFACTUAL: If unavailable or malformed review output still yields consensus:approved, revert workflow and policy module immediately and block merge until operator confirms degraded routing.

counterfactuals:
  - If EVE lane is unavailable, emit DEGRADED_UNAVAILABLE and route to ZEUS + HUMAN; never apply consensus:approved.
  - If shared-provider fallback produces advice, label DEGRADED_FALLBACK; do not treat as independent EVE quorum.
  - If needs-custodian-review is present, Sentinel Review must run intentionally — not vacuously pass with zero lanes.
  - Rollback is git revert of workflow + lib/governance/sentinelReviewPolicy.ts only.
```

---

## Summary

Removes fail-open Sentinel Review behavior and adds explicit EVE degraded-state routing for GitHub PR governance review.

## Fail-open behavior removed

- Missing `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` no longer returns `verdict: pass`.
- Parse-error recovery no longer defaults to pass.
- Aggregator no longer defaults missing verdicts to pass.
- PRs with `needs-custodian-review` now trigger review instead of vacuous success.

## EVE degradation semantics

| State | Meaning | Approval |
|---|---|---|
| `PASS` | Independent lane executed and passed | Eligible if all required lanes pass |
| `DEGRADED_UNAVAILABLE` | Credential missing or provider HTTP failure | Blocked; route ZEUS + HUMAN |
| `DEGRADED_FALLBACK` | Shared-provider advisory fallback | Blocked; not independent quorum |
| `MALFORMED` | Empty or invalid JSON | Blocked; fail closed |

## Explicit non-goals

- No provider substitution masquerading as EVE-independent attestation
- No seal quorum, MIC, GI, human authority, or production state changes
- No OAA broker repair, Track R execution, or Vault mutation

## Rollback

```bash
git revert <commit-sha>
# Restore prior sentinel-review.yml if needed
# No KV or production cleanup required
```
