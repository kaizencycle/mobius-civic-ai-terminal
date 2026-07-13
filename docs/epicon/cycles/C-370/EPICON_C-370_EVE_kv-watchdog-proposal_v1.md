---
epicon_id: EPICON_C-370_EVE_kv-watchdog-proposal_v1
title: "EVE-Owned KV/Upstash Watchdog — C-370"
author_name: "Michael Judan (custodian), drafted with Claude"
author_wallet: ""
cycle: "C-370"
epoch: ""
tier: "SUBSTRATE"
scope:
  domain: "infra"
  system: "civic-ai-terminal"
  environment: "mainnet"
epicon_type: "feature-proposal"
status: "proposal"
related_prs:
  - "https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/611"
  - "https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/612"
related_commits: []
related_epicons:
  - "EPICON_C-370_GOVERNANCE_mic-issuance-ratification_v1"
tags:
  - "eve"
  - "kv"
  - "upstash"
  - "watchdog"
  - "chain-continuity"
  - "governance-q2"
integrity_index_baseline: 0.773
risk_level: "medium"
created_at: "2026-07-13T00:00:00Z"
updated_at: "2026-07-13T00:00:00Z"
version: 1
hash_hint: ""
summary: "Proposal for an EVE-attributed KV/Upstash watchdog that escalates budget suspension, stale LATEST_SEAL_KEY, live block_number collisions, and re-attestation write spikes before they produce chain forks. Operationalizes Q2 fix #3 (KV budget headroom) and provides a live backstop for fixes #1/#2. Not yet implemented."
---

# Proposal — EVE-Owned KV/Upstash Watchdog

**Author:** Michael Judan (custodian), drafted with Claude  
**Cycle:** C-370  
**Type:** Feature proposal — not yet implemented  
**Ties to:** [`GOVERNANCE_DECISION_C-370_chain-continuity.md`](./GOVERNANCE_DECISION_C-370_chain-continuity.md) Q2 fixes — specifically fix #3 (KV budget headroom) and, indirectly, fixes #1/#2 (fatal write failures, `block_number` uniqueness), since a live watchdog is what would have caught all three conditions *before* they produced a chain fork, rather than weeks later via forensic audit.

---

## 1. Why this, why now

The Jun 26–Jul 1 incident had visible warning signs the whole time — `primary_kv_suspended: true` was sitting in ATLAS heartbeats from Jun 26–27, four days before the fork actually happened on Jul 1. Nothing consumed that signal or raised it above ambient log noise. The fork wasn't caught until this cycle's forensic audit, roughly two weeks later.

A watchdog closes that gap: same signals, checked continuously, escalated the moment they cross a threshold — not discovered after the fact by a human running a manual investigation.

## 2. Why EVE

EVE already owns `cycle-synthesize`, runs on a recurring schedule, and is one of the five seal-quorum agents — giving it standing to write EPICON entries and dispute records without needing a new agent identity provisioned. Practically: extend EVE's existing job with a KV health check step, or add a sibling scheduled route (`/api/eve/kv-watchdog`) that EVE's identity calls, rather than building an entirely separate monitoring agent.

## 3. What it checks

| Check | Threshold / condition | Signal source |
|---|---|---|
| Upstash budget/suspension state | `primary_kv_suspended: true`, or usage above N% of plan limit | Upstash REST API (`KV_REST_API_URL` account/usage endpoint, if exposed) or existing `kv/health` route |
| `LATEST_SEAL_KEY` freshness | Missing entirely, or unchanged for longer than the expected seal cadence | `vault:seal:latest` read |
| `LATEST_SEAL_KEY` write confirmation | Last N seal-append operations logged a *confirmed* write to this key, not just attempted | Extend `appendSealToChain()` to log write confirmation, not just attempt |
| `block_number` uniqueness (live) | Newly-sealed block number already exists among currently-attested seals | Same logic as `audit-reserve-block-collisions.ts`, run incrementally instead of full-history |
| Re-attestation batch size | A single re-attest operation writes more than N seals in one pass (the Jun 30 spike was 283 in one hour) | `cron/reattest-seals` invocation metadata |
| Resilient-write silent failures | `resilientSet()` (or equivalent) swallowing an error rather than surfacing it | Requires instrumenting that helper to emit a distinguishable warning/metric rather than a bare console warn |

## 4. What happens on trigger

Ranked by severity, so the response scales with how bad the signal is:

1. **Informational** (e.g., usage approaching budget) — write an EPICON entry noting the observation. No page, no block.
2. **Warning** (e.g., `LATEST_SEAL_KEY` stale beyond expected cadence) — write an EPICON entry *and* flag it in the Tripwire lane so it's visible on the terminal dashboard, not just in logs.
3. **Critical** (e.g., `primary_kv_suspended: true`, or a live `block_number` collision detected at seal time) — all of the above, plus: block further sealing until acknowledged (this is the one place I'd actually recommend a hard stop — better to pause new seals for a few minutes than silently fork the chain again), and open a GitHub issue tagged for the human custodian.

## 5. Architecture options (pick one — not deciding here)

**Option A — Extend EVE's existing cron.** Add the checks above as an early step in whatever already triggers `cycle-synthesize`. Lowest new surface area, but ties watchdog health to EVE's own uptime/credit budget (worth remembering EVE has hit its own Anthropic credit exhaustion in recent logs — a watchdog that goes silent when the agent it depends on runs out of credits is a real failure mode to design around).

**Option B — Separate lightweight cron, EVE-attributed.** A new `/api/cron/kv-watchdog` route, scheduled independently (e.g., every 5–10 minutes — tighter than the daily `reserve-canon-integrity` cron from #608, since budget suspension can develop over hours, not days), that writes/signs as EVE but doesn't depend on EVE's full `cycle-synthesize` pipeline running successfully first.

**Recommendation for discussion, not a decision:** Option B. Decoupling the watchdog from the same pipeline it's meant to catch failures in seems safer — if `cycle-synthesize` itself were degraded by the same KV issue, Option A's watchdog might degrade right along with it.

## 6. Open questions for whoever implements this

- Does Upstash's REST API actually expose a budget/usage endpoint that can be polled, or does "suspended" only surface as a failed write (in which case the watchdog needs to attempt a canary write/read, not just query a status field)?
- What's the actual expected seal cadence, to set a sane staleness threshold for `LATEST_SEAL_KEY`? (Rough seal-interval from the audit data looks like roughly one seal every several hours during active cycles — worth confirming from real seal timestamps rather than guessing.)
- Where should Critical-tier alerts land beyond a GitHub issue — is there a Slack/webhook channel already wired for anything else in this repo that this should reuse?

---

*This is a proposal, not an EPICON intent — no code has been written and no PR opened.
If this direction looks right, next step is drafting the actual EPICON-02 intent block
and handing this to ATLAS/EVE for implementation.*

```intent
epicon_id: EPICON_C-370_EVE_kv-watchdog-proposal_v1
ledger_id: kaizencycle
scope: infra, docs
mode: proposal
issued_at: 2026-07-13T00:00:00Z
expires_at: 2026-07-27T00:00:00Z
justification: |
  The Jun 26-Jul 1 chain-continuity incident (multiple_lineages: true, confirmed via
  PR #611/#612) had a visible warning sign — primary_kv_suspended: true in ATLAS
  heartbeats — sitting unconsumed for four days before the actual fork occurred.
  No live monitoring existed to escalate that signal; the incident was only found
  two weeks later via forensic audit. This proposal adds a KV/Upstash watchdog,
  owned by EVE (existing seal-quorum agent, already runs cycle-synthesize on a
  schedule), to catch budget suspension, stale LATEST_SEAL_KEY, live block_number
  collisions, and re-attestation write spikes as they happen rather than after
  the fact. This directly operationalizes fix #3 (KV budget headroom) from
  GOVERNANCE_DECISION_C-370_chain-continuity.md Q2, and provides a live backstop
  for fixes #1 and #2 (fatal write failures, uniqueness constraint) — even once
  those are coded, a watchdog independently verifies they're holding.
counterfactuals:
  - If Upstash's REST API has no queryable budget/usage endpoint, the canary-write
    approach (attempt a small write/read and check for suspension errors) must be
    used instead of a status-field poll — this changes the implementation but not
    the intent.
  - If EVE's own Anthropic API credit exhaustion (observed in production logs,
    cron/swarm cooldowns) would leave a watchdog dark at the same time something
    is wrong, prefer the decoupled architecture (a separate scheduled route,
    EVE-attributed but not dependent on cycle-synthesize succeeding first) over
    extending EVE's existing cron directly.
  - If the human custodian or seal quorum decides the hard-stop-on-critical
    behavior (blocking new seals when primary_kv_suspended fires) is too
    aggressive, downgrade to warning-tier alerting only — but that tradeoff
    should be an explicit decision, not a silent default.
  - This intent authorizes design/proposal work and repo documentation only.
    Actual implementation (new routes, cron wiring, modifying appendSealToChain
    or resilientSet) requires a follow-up EPICON-02 intent scoped to code changes,
    reviewed against this proposal.
pipe_justification: |
  No pipeline mutation in this intent — proposal and documentation only.
```
