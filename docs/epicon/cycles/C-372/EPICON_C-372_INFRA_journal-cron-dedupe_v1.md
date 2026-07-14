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

> **Intent publication:** Use the combined intent in `EPICON_C-372_INFRA_journal-dedupe-seal-integrity_v1.md` for PR #622. This file is component documentation only.
