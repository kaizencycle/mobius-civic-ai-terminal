# Closing Seal — Cycle C-370

**Status:** DISPUTED / PARTIAL  
**Sealed by:** Michael Judan (custodian)  
**Date:** 2026-07-13  
**Filed by:** ATLAS (Cursor agent), at custodian direction  
**Precedent:** This seal follows the same pattern as C-369, which was left DISPUTED rather than force-closed when the earnMIC/computeMICReward contradiction was found live at seal time. C-370 opened citing that dispute as its justification. This seal does the same thing in reverse: it closes C-370 honestly, as partial, and names the carry-forward list that the next cycle should cite as its own opening justification — the same way C-370 cited C-369.

**Related:** [`AUDIT_C-370_status-prior-to-closing-seal.md`](./AUDIT_C-370_status-prior-to-closing-seal.md), [`README.md`](./README.md)

---

## What C-370 resolved

- **Doctrine ratified:** `mic_issuance_protocol.md` moved out of C-285-draft status into canon. `earnMIC` gated on `gi.score >= 0.95` (PR #597).
- **Chain continuity incident confirmed and root-caused:** `multiple_lineages: true` verified directly against production KV (not a UI artifact). Root cause for the C-359 fork identified: Upstash budget suspension → silent `LATEST_SEAL_KEY` write failure → block_number restart on resume, compounded by no uniqueness constraint at seal time. This was infrastructure failure, not a governance decision — confirmed via ATLAS's technical reconstruction against ZEUS catalog evidence (PR #612).
- **Collision forensics tooling built:** `audit-seal-hash-lineage.ts`, `audit-reserve-block-collisions.ts`, and a `workflow_dispatch` GitHub Action to run both against production KV without credentials ever touching chat (PR #611).
- **Reserve Block canon export landed:** 194 unique blocks, chain-verified (Substrate PR #380) — understood now as a deduped view over a forked history, not evidence of a clean single chain.
- **Reserve canon integrity monitoring shipped:** scheduled hot/cold gap and collision alerting (PR #608).
- **EVE KV/Upstash watchdog shipped:** live monitoring for KV budget suspension, `LATEST_SEAL_KEY` staleness, and re-attestation batch spikes (PR #615). Monitoring only — does not itself implement the Q2 sealing-path fixes it watches for.
- **Governance decision framework filed:** structured, no-pre-selected-option template forcing explicit human decisions rather than allowing agent inference to stand in for custodian sign-off (`GOVERNANCE_DECISION_C-370_chain-continuity.md`).
- **Terminal production bugs identified via direct log audit:** `cron/promote` 401 (wrong token type), `cron/sweep` ZEUS JSON-parse failure, `vault/status` timeouts, `cron/swarm` Anthropic credit exhaustion, stale cycle label in swarm logging. Fixes drafted (`PRODUCTION_LOG_AUDIT_FIXES.md`).
- **Intent Publication Engine gap identified and partially closed:** automated EPICON-02 intent generation confirmed working for the reserve-canon export PR opener specifically (PR #608 commit).

## What C-370 did not resolve — carried forward explicitly

This is the authoritative carry-forward list. The next cycle's opening justification should cite this section directly, the same way C-370's opener cited C-369's dispute.

| Priority | Item | State at seal |
|---|---|---|
| Governance | **Q1 — orphan fragment** (`seal-C-308-042`, `orphan_prev`, no genesis, predates the Jun 26 KV incident by ~6 weeks) | No resolution option (a/b/c) selected. Catalog-boundary evidence filed ([`NOTE_C-370_Q1_catalog-history-C307-C308-boundary.md`](./NOTE_C-370_Q1_catalog-history-C307-C308-boundary.md)); no conclusive resolution evidence. Governance decision still OPEN. |
| Governance | **Q2 — custodian sign-off** | Technical root cause filed (ATLAS reconstruction per PR #612); custodian acceptance pending — sign-off date/signature line on [`GOVERNANCE_DECISION_C-370_chain-continuity.md`](./GOVERNANCE_DECISION_C-370_chain-continuity.md) still blank. |
| Governance | **Q3 — MIC reconciliation** | 0 of 119 dropped-but-fully-quorum-signed seals checked against the MIC ledger. Checklist ready (`MIC_RECONCILIATION_C-370_dropped-seals.md`); no rows completed. |
| Doctrine | **`earnMIC` sustain-window gap** | Gate checks instantaneous `gi.score`, not the `consecutiveGi95Cycles` sustain tracker the ratified doctrine actually requires. Flagged by Codex on PR #597; not yet wired. |
| Production | **Log-audit fixes unverified in production** | Fixes for `cron/promote`, `cron/sweep`, `vault/status`, and `cron/swarm` drafted but not confirmed live against a fresh production log pull. |
| Process | **AUREA items 7, 10, 11, 12, 14, 16, 17** | Explicitly marked not-checked-this-session by AUREA in PR #598. Status unknown, not merely unresolved. |
| Process | **Seal-quorum attestation mechanism** | Still unresolved whether multi-agent quorum sign-off is an independently exercisable check or a narrative framing over ordinary PR review. Raised by AUREA, never settled. This bears directly on how much weight to give every "5/5 quorum" notation elsewhere in this seal, including the 119 dropped seals in the MIC reconciliation item above. |
| Infra | **KV budget headroom fix (Q2 fix #3)** | Named as a required fix; not confirmed whether the earlier cron-normalization fix (`*/5–*/15` → `*/30`) held, or whether a distinct new exhaustion event is occurring. |
| Infra | **`LATEST_SEAL_KEY` fatal-write fix, block_number uniqueness constraint (Q2 fixes #1, #2)** | Named as required fixes for the confirmed root cause. Not yet implemented — the watchdog (shipped) monitors for these conditions but does not correct them. |

## Explicit non-closure statement

Per Canon law ("no rollback without proof, operator consent, and preserved incident history") and per this cycle's own founding doctrine (§17, the Witness Principle), this seal does not assert that the above items are resolved, acceptable to leave unresolved, or someone else's problem by default. It asserts only that C-370's own scope — the doctrine ratification and the initial response to the chain-continuity discovery — reached a defensible stopping point, and that what remains is explicitly named rather than silently dropped.

**Signed:** Michael Judan  
**Date:** 2026-07-13  
**Status:** DISPUTED / PARTIAL — not COMPLETE
