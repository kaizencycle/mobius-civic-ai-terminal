# C-370 Full Audit — Status Prior to Closing Seal Decision

**Compiled by:** Claude, at Michael Judan's request  
**Filed by:** ATLAS (Cursor agent)  
**Date:** 2026-07-13  
**Purpose:** Establish ground truth on every open thread before any closing-seal decision is made. This is an audit, not a recommendation to seal — that recommendation follows at the end, and it is not "yes."

**Related:** [`GOVERNANCE_DECISION_C-370_chain-continuity.md`](./GOVERNANCE_DECISION_C-370_chain-continuity.md), [`README.md`](./README.md)

---

## Post-filing repository updates (2026-07-13, after audit draft)

Ground truth changed after the audit text below was drafted:

| Item | Update |
|------|--------|
| EVE KV watchdog (Workstream 6) | **SHIPPED** — [PR #615](https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/615) merged; escalation hardening on `main` @ `94469ead`. Monitoring live; Q2 sealing-path fixes #1/#2 still separate. |
| Workstream 4 (`cron/promote`, `cron/sweep`, etc.) | Code fixes documented in [`PRODUCTION_LOG_AUDIT_FIXES.md`](./PRODUCTION_LOG_AUDIT_FIXES.md) — **deploy verification still required** before marking resolved. |

Workstream 6 table below reflects the **pre-merge** state at audit compile time; see update row above for current repo state.

---

## Executive summary

C-370 opened on a real, confirmed doctrine violation and has, over its course, surfaced a **second, larger, and still-unresolved integrity finding** (the chain continuity fork) that wasn't part of the original opening justification. Two of three governance questions from that second finding are still open. Several concrete production bugs found via direct log audit remain unconfirmed as fixed in production. The EVE watchdog proposal shipped as monitoring code after this audit was drafted, but the four Q2 sealing-path fixes and governance Q1/Q3 remain open. Sealing now would mean sealing with at least three known, named, unresolved items — which is the exact condition that made C-369 need reopening in the first place.

---

## Workstream 1 — MIC issuance doctrine (the cycle's original justification)

| Item | Status |
|---|---|
| 1–2: Ratify `mic_issuance_protocol.md`, gate `earnMIC` on GI ≥ 0.95 | **DONE** — PR #597, merged |
| 4 (AUREA list): Wire `earnMIC` gate to `consecutiveGi95Cycles` sustain tracker, not instantaneous GI | **OPEN** — flagged by Codex on #597, deferred to AUREA handoff, no confirmed fix since |

**Assessment:** The headline doctrine fix shipped, but its own sustain-window gap — the thing that would make a single GI spike unable to trigger a premature mint — is still open. This is the same category of problem the doctrine was written to prevent.

---

## Workstream 2 — Reserve Block export & chain continuity (discovered mid-cycle, not part of original scope)

| Item | Status |
|---|---|
| Reserve Block `.dat` export (#380, Substrate) | Merged, but its correctness assumption changed mid-investigation |
| `multiple_lineages: true` | **CONFIRMED** via direct KV audit (PR #611 workflow run) — three components: orphan fragment (no genesis), Chain B, Chain C |
| Q1 — orphan fragment (`seal-C-308-042`, `orphan_prev`) | **OPEN** — no resolution options selected; catalog-boundary evidence filed ([`NOTE_C-370_Q1_catalog-history-C307-C308-boundary.md`](./NOTE_C-370_Q1_catalog-history-C307-C308-boundary.md)); predates Jun 26 KV incident by ~6 weeks |
| Q2 — C-359 restart / uniqueness gap | **RESOLVED (technical)** — confirmed root cause: Upstash budget suspension → silent `LATEST_SEAL_KEY` write failure → fork on resume. **Custodian sign-off/date still not recorded** on the governance doc |
| Q3 — MIC reconciliation (119 dropped, fully quorum-signed seals) | **OPEN, not started** — checklist built ([`MIC_RECONCILIATION_C-370_dropped-seals.md`](./MIC_RECONCILIATION_C-370_dropped-seals.md)), zero of 119 rows checked |
| Item 4 (original checklist) — `cron/reattest-seals` runtime log confirmation | **PARTIAL** — KV-side evidence only; runtime logs for the Jun 30 window not yet cited |
| Q2 fixes #1–4 (fatal write failure, uniqueness constraint, budget headroom, gentler batching) | **NOT YET IMPLEMENTED** in sealing code — watchdog (#615) provides **monitoring/backstop** for #3 and detects symptoms of #1/#2; does not replace code fixes |

**Assessment:** This is the largest open risk in the cycle. `multiple_lineages: true` is a confirmed P0. One of three governance questions is fully open with zero custodian decision (Q1). The MIC reconciliation question — whether real value was credited against seals that no longer exist in canon — has a ready checklist and zero completed rows. None of the four concrete sealing-path fixes have been implemented in `resilientSet()` / `appendSealToChain()` / batching yet.

---

## Workstream 3 — AUREA's remaining items (PR #598, 18 items handed off)

| Item | Status |
|---|---|
| Item 5 — Reserve Block `.dat` backlog export | Done (superseded by the chain-continuity finding — the "194" it produced is now understood differently than originally assumed) |
| Item 21 — stale `CURRENT_CYCLE.md` | Resolved (confirmed fresh at session start of #598) |
| Items 7, 10, 11, 12, 14, 16, 17 | **Not checked this session per AUREA's own handoff** — status unknown |
| Seal quorum attestation mechanism (raised as an open question by AUREA) | **Still unresolved** — unclear whether multi-agent quorum attestation is an exercisable mechanism distinct from ordinary PR review, or a narrative framing without independent teeth |

**Assessment:** A meaningful fraction of the original 20-optimization list was never independently verified this cycle. The seal-quorum question is arguably the most important unresolved meta-question in all of C-370 — if quorum attestation isn't a real, independent check, then every "5/5 quorum signed" notation in this cycle's evidence (including the 119 dropped seals in Workstream 2) may carry less weight than assumed.

---

## Workstream 4 — Terminal production bugs (found via direct runtime log audit, separate handoff)

| Item | Status |
|---|---|
| `cron/promote` 401 (wrong token type at Identity introspect) | Fixes in [`PRODUCTION_LOG_AUDIT_FIXES.md`](./PRODUCTION_LOG_AUDIT_FIXES.md) — **not confirmed resolved in production** as of last log pull cited in audit |
| `cron/sweep` ZEUS verification JSON-parse failure (HTML response) | Same — fix documented, production recurrence not ruled out |
| `vault/status` timeouts/503s + log-attribution bug | Log-attribution fix documented; timeouts/503s status unknown |
| `cron/swarm` — Anthropic API credit exhaustion (ATLAS, ECHO, AUREA, HERMES) | **Confirmed live** in audited window — billing issue not yet addressed |
| `cron/swarm` logging `"run complete @ C-306"` instead of C-370 | Found, not fixed |
| GI divergence across endpoints | Downgraded in severity after second log pull — worth re-confirming, not fully resolved |

**Assessment:** Production verification lagging behind merged fixes. `cron/promote` failing in the audited window means EPICON promotion candidates may have been stuck for much of the cycle.

---

## Workstream 5 — Intent Publication Engine (memory item, cross-cutting)

| Item | Status |
|---|---|
| Automated EPICON-02 intent generation for PR openers | **Partially implemented** — confirmed working for reserve-canon export PR opener (#608). PR #613/#615 required manual EPICON-02 block formatting; gate passes when structured correctly |

---

## Workstream 6 — EVE KV/Upstash watchdog

| Item | Status (at audit compile) | Status (current on `main`) |
|---|---|---|
| Proposal | Filed — PR #613, `mode: proposal` | Unchanged |
| Implementation | Not started at compile time | **MERGED** — PR #615 + `94469ead` escalation hardening. `hard_stop_enabled: false`. Q2 sealing fixes still separate intents. |

**Assessment:** Monitoring layer now exists; does not close Q1/Q3 or substitute for sealing-path fixes #1–#2.

---

## What a closing seal would currently assert (and why that's a problem)

A seal on C-370 right now would be asserting, at minimum:

- That the doctrine fix (Workstream 1) is complete, when its own sustain-window gap is open.
- That the chain-continuity incident (Workstream 2) is resolved, when one of three governance questions has zero progress and the reconciliation check hasn't been run.
- That the remaining AUREA items (Workstream 3) were addressed, when several were explicitly marked not-checked by AUREA itself.
- That production is healthy (Workstream 4), when several bugs are not confirmed fixed in the most recent log pull available.

This is structurally the same situation that made C-369 need reopening: sealing over known, named, unresolved contradictions. The entire opening justification of C-370 was that doing this is exactly what §17 / the Witness Principle exists to prevent.

---

## Recommendation

**Do not seal C-370 as complete right now.** Recommended options instead:

1. **Seal C-370 as DISPUTED or PARTIAL**, explicitly, the same way C-369 was left DISPUTED rather than force-closed — an honest partial seal that names exactly what's outstanding (this audit) is consistent with the cycle's own doctrine. This is very different from either "fully sealed" or "silently left open."

2. **Open C-371** to carry the outstanding items forward as its opening justification — mirroring exactly how C-370 itself opened on C-369's unresolved contradiction. This keeps the audit trail honest: each cycle's opener is the previous cycle's honest account of what wasn't finished.

3. Either way: **get custodian sign-off on Q2 recorded**, and at minimum **start the Q1 investigation and the Q3 MIC reconciliation** before any seal — those two are the items with the least excuse for remaining untouched, since Q1 just needs someone to check old records and Q3 just needs the checklist to be run.

---

## Next artifacts (custodian choice — not pre-selected)

- DISPUTED closing seal for C-370 naming every open item above explicitly, or
- C-371 opener carrying these items forward

**Avoid:** a seal that reads as "complete."

---

*"We heal as we walk." — Mobius Systems*
