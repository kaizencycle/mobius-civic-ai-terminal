---
epicon_id: EPICON_C-372_INFRA_journal-cron-dedupe_v1
title: "Journal cron write-on-delta dedupe — C-372"
author_name: "Michael Judan (custodian)"
cycle: "C-372"
tier: "INFRA"
scope:
  domain: "infra"
  system: "civic-ai-terminal"
  environment: "mainnet"
epicon_type: "implementation-intent"
status: "proposed"
tags:
  - "journal"
  - "dedupe"
  - "kv"
  - "cron"
  - "hermes"
  - "zeus"
created_at: "2026-07-14T16:30:00Z"
summary: "Suppress journal writes for cron entries whose semantic content is identical to the agent's previous entry; track suppressed_count on retained entry. Alert-lane entries never suppressed."
---

# EPICON C-372 — Journal cron dedupe (write-on-delta)

**Trigger:** ~70 of last 100 journal entries were near-identical HERMES/ZEUS cron pairs, burying alert-lane entries and generating KV write volume comparable to the C-354 Upstash budget incident root cause.

## Mechanism

1. SHA-256 hash of semantic fields (agent, cycle, scope, observation, inference, recommendation, confidence, category, severity, status, agentOrigin) — excludes id, timestamp, derivedFrom
2. Compare against `journal:dedupe:{agent}:{category}` last hash
3. On match: increment `dedupe.suppressed_count` and `last_seen_at` on head list entry; skip new write
4. Alert category or critical severity: **never suppressed**
5. `agent:meta:last_journal_at` still updated on suppressed sweeps (liveness preserved)

**Rollback:** `JOURNAL_DEDUPE=off`

## Secondary

- Removed duplicate `appendJournalLaneEntry` call in `appendAtlasCronJournal` (Writer A already cross-writes via `appendAgentJournalEntry`)
- Confirmed `vercel.json` sweep/heartbeat cadence at `*/30` (C-354 normalization)

---

```intent
epicon_id: EPICON_C-372_INFRA_journal-cron-dedupe_v1
ledger_id: kaizencycle
scope: infra
mode: enforce
issued_at: 2026-07-14T16:30:00Z
expires_at: 2026-07-28T16:30:00Z
justification:
  VALUES INVOKED: integrity, observability, efficiency
  REASONING: Suppress journal writes for cron entries whose semantic content is identical to the agent's previous entry modulo timestamp and entry ID. Approximately 70 of the last 100 journal entries were near-identical HERMES/ZEUS sweep pairs, burying alert-lane entries and generating KV write volume of the same class that caused the C-354 Upstash budget suspension. Witness preservation via suppressed_count on retained entries — cadence recoverable, content verifiable by hash.
  ANCHORS:
    - docs/epicon/cycles/C-372/EPICON_C-372_INFRA_journal-cron-dedupe_v1.md
    - docs/epicon/cycles/C-370/GOVERNANCE_DECISION_C-370_chain-continuity.md
    - lib/agents/journalLane.ts
  BOUNDARIES: No deletion of witness records. Alert-lane entries never suppressed. Rollback via JOURNAL_DEDUPE=off. Does not change canon export or seal logic.
  COUNTERFACTUAL: If Intent Publication Gate rejects this block, correct scope and I6 fields per EPICON-02 before merge.
counterfactuals:
  - If hash false-positives suppress meaningful deltas, narrow hash fields or add GI-in-observation normalization in follow-up.
  - If operators need full cron cadence visible in feed, surface suppressed_count in journal UI (separate UX intent).
  - If dedupe key TTL expires before next identical sweep, a duplicate row may write once — acceptable; key refreshes on each write.
```
