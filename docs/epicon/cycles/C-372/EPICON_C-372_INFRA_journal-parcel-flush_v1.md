---
epicon_id: EPICON_C-372_INFRA_journal-parcel-flush_v1
title: "Journal parcel flush lane — KV → git cold canon — C-372"
author_name: "Michael Judan (custodian)"
cycle: "C-372"
tier: "EP-2"
scope:
  domain: "infra"
  system: "civic-ai-terminal"
  environment: "mainnet"
epicon_type: "implementation-intent"
status: "proposed"
related_epicons:
  - "EPICON_C-372_INFRA_journal-dedupe-seal-integrity_v1"
tags:
  - "journal"
  - "canon"
  - "parcel"
  - "daedalus"
  - "substrate"
created_at: "2026-07-14T17:00:00Z"
summary: "Additive cold-canon lane flushing sealed journal parcels from Upstash KV to Mobius-Substrate/canon/journal/ as hash-chained JSONL via DAEDALUS GitHub App."
---

# EPICON C-372 — Journal parcel flush lane

## EPICON-02 intent block (PR body)

```intent
epicon_id: EPICON_C-372_INFRA_journal-parcel-flush_v1
ledger_id: kaizencycle
scope: core,specs
mode: normal
issued_at: 2026-07-14T17:00:00Z
expires_at: 2026-10-12T17:00:00Z
justification:
  VALUES INVOKED: integrity, custodianship, permanence, no-vendor-truth
  REASONING: Add a cold-canon persistence lane that flushes sealed journal parcels from Upstash KV to Mobius-Substrate canon/journal/ as hash-chained JSONL, committed via PR by the scoped DAEDALUS GitHub App (mobius-daedalus-writer). KV remains the hot lane; git becomes the witnessed cold lane. Addresses C-354 KV suspension, LATEST_SEAL_KEY silent write failure, and C-370/C-371 chain-continuity incidents. Trigger is seal quorum reached — not cron. Depends on journal-cron-dedupe (C-372 Block 2) merged first.
  ANCHORS:
    - docs/epicon/cycles/C-372/EPICON_C-372_INFRA_journal-parcel-flush_v1.md
    - scripts/flush-parcel.mjs
    - scripts/verify-parcel-chain.mjs
    - .github/workflows/canon-journal-verify.yml
    - lib/journal/parcelFlush.ts
  BOUNDARIES: Reserve Block .dat lane out of scope. No bulk historical backfill. JOURNAL_FLUSH defaults off until operator verifies first manual flush. Rollback via JOURNAL_FLUSH=off or App installation revocation.
  COUNTERFACTUAL: If Intent Publication Gate rejects scope or I6 fields, re-publish with core,specs scope and structured COUNTERFACTUAL before merge.
counterfactuals:
  - If DAEDALUS App revoked, terminal logs loud failure; KV hot lane unchanged
  - If partial KV read during flush, abort — never write parcel with fewer entries than seal.source_entries
  - If prev_parcel_hash chain breaks, verifier exits nonzero offline from fresh clone
```

## Operator setup (not automated)

1. Create GitHub App `mobius-daedalus-writer` on kaizencycle org
2. Permissions: Contents RW, Pull requests RW
3. Install on `Mobius-Substrate` only
4. Set secrets on Terminal (Render/Vercel): `DAEDALUS_APP_ID`, `DAEDALUS_APP_KEY`
5. Enable lane: `JOURNAL_FLUSH=on` after first manual `node scripts/flush-parcel.mjs --seal-id=...` validates clean

## Invariants

| ID | Invariant |
|----|-----------|
| I1 | Intent declared (this block) |
| single-writer | Only DAEDALUS App token writes `canon/journal/**` |
| chain-in-files | SHA-256 prev_hash → hash inside parcels; git is transport |
| guard-gated | Flush PRs pass EPICON Guard |
| no-vendor-truth | Canon validity verifiable offline from file contents |
