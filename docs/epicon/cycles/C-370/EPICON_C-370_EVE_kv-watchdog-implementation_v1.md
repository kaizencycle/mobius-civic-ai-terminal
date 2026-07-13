---
epicon_id: EPICON_C-370_EVE_kv-watchdog-implementation_v1
title: "EVE KV/Upstash Watchdog — Implementation Intent — C-370"
author_name: "Michael Judan (custodian), drafted with Claude"
author_wallet: ""
cycle: "C-370"
epoch: ""
tier: "SUBSTRATE"
scope:
  domain: "infra"
  system: "civic-ai-terminal"
  environment: "mainnet"
epicon_type: "implementation-intent"
status: "in_progress"
related_prs:
  - "https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/613"
  - "https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/615"
related_commits: []
related_epicons:
  - "EPICON_C-370_EVE_kv-watchdog-proposal_v1"
tags:
  - "eve"
  - "kv"
  - "upstash"
  - "watchdog"
  - "chain-continuity"
  - "implementation"
integrity_index_baseline: 0.773
risk_level: "medium"
created_at: "2026-07-13T00:50:00Z"
updated_at: "2026-07-13T00:50:00Z"
version: 1
hash_hint: ""
summary: "Implementation intent for EVE-attributed KV/Upstash watchdog (Option B). Implemented in PR #615; hard-stop sealing gated off pending custodian sign-off."
---

# EPICON C-370 — EVE KV/Upstash Watchdog Implementation Intent

**Status:** In progress — implementation PR [#615](https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/615) (`cursor/eve-kv-watchdog-0e02`); pending merge and deploy
**Follows:** [`EPICON_C-370_EVE_kv-watchdog-proposal_v1.md`](./EPICON_C-370_EVE_kv-watchdog-proposal_v1.md) (proposal, PR #613)  
**Architecture:** Option B — decoupled `/api/cron/kv-watchdog`, EVE-attributed, independent of `cycle-synthesize`

---

## Deliberate choices (custodian)

### 1. Q2 code fixes are **not** bundled

`resilientSet()` and `appendSealToChain()` changes (Q2 fixes #1/#2) are **explicitly out of scope** for this intent. Fixing silent failures and building a watchdog that *detects* silent failures are separate changes with separate risk profiles — one touches live sealing logic, the other is purely additive monitoring. A review problem in one must not block the other from shipping.

The watchdog **verifies** those fixes are holding once they land; it does **not** implement them.

### 2. Hard-stop-on-critical requires explicit sign-off

Blocking new seals when `primary_kv_suspended` fires is gated as a formal **`open_decisions_required_before_merge`** item — not merely an open question. It cannot quietly ship as a side effect of "the watchdog PR looked done."

If the custodian/quorum decision is not ready when the PR is otherwise complete: **ship checks and alerting first**; split sealing-block behavior into a clearly labeled follow-up.

### 3. Intent Publication Engine format

Per PR #597's EPICON Guard failure despite intent-shaped content, and PR #613's fix (single `scope` value + full I6 justification fields), **verify the fenced intent block below passes `kaizencycle/epicon@v1` before relying on it** when opening the implementation PR. The block below follows the structure confirmed working on PR #613.

---

## Scope detail

### New files

| Path | Role |
|------|------|
| `app/api/cron/kv-watchdog/route.ts` | Scheduled watchdog route (or equivalent per repo routing convention) |
| `lib/watchdog/kvHealthChecks.ts` | Shared check logic — six checks from proposal §3 |

### Modified files

| Path | Role |
|------|------|
| `vercel.json` | Cron schedule entry, 5–10 min cadence (confirm interval against seal cadence data before finalizing) |

### Explicitly out of scope

- Changes to `resilientSet()` or `appendSealToChain()` (Q2 fixes #1/#2) — separate intents
- Sealing/mint logic, MIC issuance, Reserve Block export (#380/#598/#611/#612) — monitoring only

---

## Open decisions required before merge

1. **Upstash budget/usage endpoint** — if none exists, implement canary-write fallback (proposal §6) instead of status poll.
2. **`LATEST_SEAL_KEY` staleness threshold** — derive from lineage-audit seal-interval data; state derived threshold and basis in implementation PR body.
3. **Critical-tier alert destination** — reuse existing Slack/webhook vs GitHub issue only for initial rollout.
4. **Hard-stop-on-critical** — explicit custodian or seal-quorum sign-off before enabling seal blocking; ship check + alerting first if undecided.

---

## EPICON-02 INTENT PUBLICATION (paste into implementation PR body)

**Usage:** Paste the fenced `intent` block below into the PR body per `.github/PULL_REQUEST_TEMPLATE.md` §3 when implementation work begins. Confirm it passes Intent Publication Gate before merge.

```intent
epicon_id: EPICON_C-370_EVE_kv-watchdog-implementation_v1
ledger_id: kaizencycle
scope: infra
mode: enforce
issued_at: 2026-07-13T00:50:00Z
expires_at: 2026-07-27T00:50:00Z
justification:
  VALUES INVOKED: integrity, observability, custodianship
  REASONING: Implement Option B from EPICON_C-370_EVE_kv-watchdog-proposal_v1 — a decoupled EVE-attributed cron route performing live KV/Upstash health checks and tiered escalation (proposal section 4). Closes the gap where primary_kv_suspended sat in ATLAS heartbeats for four days before the Jul 1 chain fork. Monitoring is additive; Q2 sealing fixes ship separately.
  ANCHORS:
    - docs/epicon/cycles/C-370/EPICON_C-370_EVE_kv-watchdog-proposal_v1.md
    - docs/epicon/cycles/C-370/EPICON_C-370_EVE_kv-watchdog-implementation_v1.md
    - docs/epicon/cycles/C-370/GOVERNANCE_DECISION_C-370_chain-continuity.md
    - scripts/audit-reserve-block-collisions.ts
  BOUNDARIES: No changes to resilientSet(), appendSealToChain(), sealing/mint logic, MIC issuance, or Reserve Block export. Hard-stop-on-critical (blocking new seals) requires separate custodian/quorum sign-off — ship checks and alerting first if undecided. New route is read-only-by-default; EPICON entries, Tripwire flags, and GitHub issues are additive escalation only.
  COUNTERFACTUAL: If Intent Publication Gate rejects this block, correct scope (single allowed value) and I6 justification fields per EPICON-02 before merge — narrative PR text does not substitute.
counterfactuals:
  - If EVE agent identity cannot be reused for a decoupled cron without depending on EVE's swarm/generation pipeline, use a lightweight service credential attributed to EVE in output but not dependent on EVE runtime health.
  - If the six checks require KV read patterns that risk meaningful budget usage, scale check frequency down rather than skip checks — under-monitoring to save budget defeats the watchdog's purpose.
  - If hard-stop-on-critical is not signed off by merge time, ship monitoring and alerting only; open a follow-up intent for seal-blocking behavior.
  - If Upstash has no queryable budget endpoint, use canary-write/read for suspension detection instead of status-field poll.
```

---

*Implementation landed in PR #615. Hard-stop sealing remains gated off (`hard_stop_enabled: false`) pending custodian sign-off.*
