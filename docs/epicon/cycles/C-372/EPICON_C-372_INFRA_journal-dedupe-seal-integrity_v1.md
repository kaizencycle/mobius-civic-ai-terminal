---
epicon_id: EPICON_C-372_INFRA_journal-dedupe-seal-integrity_v1
title: "Journal cron dedupe + seal integrity gate — C-372"
author_name: "Michael Judan (custodian)"
cycle: "C-372"
tier: "INFRA"
scope:
  domain: "infra"
  system: "civic-ai-terminal"
  environment: "mainnet"
epicon_type: "implementation-intent"
status: "proposed"
related_epicons:
  - "EPICON_C-370_EVE_kv-watchdog-implementation_v1"
tags:
  - "journal"
  - "dedupe"
  - "seal"
  - "attestation"
  - "block_number_collisions"
  - "vault"
created_at: "2026-07-14T16:30:00Z"
summary: "Single C-372 intent covering journal write-on-delta dedupe and seal integrity gate while KV watchdog reports critical block_number_collisions."
---

# EPICON C-372 — Journal dedupe + seal integrity gate

Combined implementation intent for PR #622. Supersedes parallel intent publication in separate proposal docs.

## Components

1. **Journal cron dedupe** — content-hash write-on-delta; `JOURNAL_DEDUPE=off` rollback
2. **Seal integrity gate** — block pass attestations and new candidates during critical `block_number_collisions`; `SEAL_INTEGRITY_GATE=off` rollback

See also:

- `EPICON_C-372_INFRA_journal-cron-dedupe_v1.md` (component detail)
- `EPICON_C-372_GOVERNANCE_seal-attestation-flag_v1.md` (component detail)

---

```intent
epicon_id: EPICON_C-372_INFRA_journal-dedupe-seal-integrity_v1
ledger_id: kaizencycle
scope: infra
mode: normal
issued_at: 2026-07-14T16:30:00Z
expires_at: 2026-07-28T16:30:00Z
justification:
  VALUES INVOKED: integrity, observability, efficiency, custodianship
  REASONING: C-372 journal feed triage identified two coupled infra failures. Approximately 70 of 100 journal entries were near-identical HERMES/ZEUS cron pairs burying alert-lane signal and burning KV budget (same class as C-354 Upstash suspension). EVE fired KV watchdog critical block_number_collisions after seal-C-372-002 formed with attestation window open — sealing into an active collision namespace risks repeating C-370/C-371 chain-continuity failures with fresh quorum signatures. This intent ships content-hash journal dedupe with suppressed_count witness metadata and a seal integrity gate that withholds pass attestations and blocks new candidate formation until the collision alert clears.
  ANCHORS:
    - docs/epicon/cycles/C-372/EPICON_C-372_INFRA_journal-dedupe-seal-integrity_v1.md
    - docs/epicon/cycles/C-370/GOVERNANCE_DECISION_C-370_chain-continuity.md
    - docs/epicon/cycles/C-370/EPICON_C-370_EVE_kv-watchdog-implementation_v1.md
    - lib/agents/journalLane.ts
    - lib/watchdog/sealIntegrityGate.ts
    - journal:EVE-C-372-1784043644374
    - seal:seal-C-372-002
  BOUNDARIES: Rollback via JOURNAL_DEDUPE=off and SEAL_INTEGRITY_GATE=off. Gate blocks pass verdicts and new candidate formation only; flag and reject remain allowed. Alert-lane journal entries never suppressed. Does not implement Q2 resilientSet/appendSealToChain fixes, GI layer reconciliation, or CPC redeploy.
  COUNTERFACTUAL: If Intent Publication Gate rejects this block, correct scope (single allowed value) and I6 justification fields per EPICON-02 before merge.
counterfactuals:
  - If hash false-positives suppress meaningful journal deltas, narrow hash fields in a version-bumped follow-up intent.
  - If gate blocks finalization indefinitely, sentinels may attest flag until timeout; quarantine path remains available.
  - If collision alert is stale KV artifact, clearing watchdog state unblocks without code deploy.
```
