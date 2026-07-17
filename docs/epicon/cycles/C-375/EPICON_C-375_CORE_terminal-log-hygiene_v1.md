---
epicon_id: EPICON_C-375_CORE_terminal-log-hygiene_v1
title: "Terminal log hygiene — five-lane calibration"
author_name: "Michael Judan (custodian)"
cycle: "C-375"
tier: "CORE"
scope:
  domain: "core"
  system: "civic-ai-terminal"
  environment: "mainnet"
epicon_type: "implementation-intent"
status: "proposed"
tags:
  - "logging"
  - "ledger-zeus"
  - "identity-token"
  - "swarm"
  - "og"
created_at: "2026-07-17T23:00:00Z"
summary: "Calibrate production log severity across five lanes; encode discipline in docs/LOGGING.md."
---

# EPICON C-375 — Terminal log hygiene

Implementation intent for PR #628. Witness table: `LOG_HYGIENE_WITNESS.md`.

```intent
epicon_id: EPICON_C-375_CORE_terminal-log-hygiene_v1
ledger_id: mobius:terminal:log-hygiene-c375
scope: core
mode: normal
issued_at: 2026-07-17T23:00:00Z
expires_at: 2026-08-17T23:00:00Z
justification:
  VALUES INVOKED: signal-integrity, calibration, cron-frugality, cost-integrity
  REASONING: Production logs are the Terminal self-report channel and are miscalibrated. Approximately 40% of error-level volume is DEP0169 deprecation noise carrying zero information; ledger-zeus journal fetch returned deployment HTML every ~10 minutes; identity-token login timeouts fire on nearly every kv-watchdog run despite KV cache; swarm cron burns Anthropic credits in a permanent sawtooth; OG font fetch fails on the command glyph. Fix three defects, silence one noise source, encode log-level discipline, and leave correct gate behaviors loud.
  ANCHORS:
    - Vercel log export 2026-07-16/17 (custodian capture)
    - C-354 cron normalization playbook
    - lib/substrate/identityToken.ts KV-cache lineage (C-326..C-338)
    - docs/epicon/cycles/C-375/LOG_HYGIENE_WITNESS.md
    - docs/LOGGING.md
  BOUNDARIES: Terminal repo only. No vault/status computation, seal lineage, integrity-gate logic, identity-service deployment, kv-watchdog 409 semantics, or OAA broker integration for swarm.
  COUNTERFACTUAL: If any lane regresses a currently-200 endpoint post-merge, revert that lane independently. If DEP0169 persists after NODE_OPTIONS, file dependency upgrade issue. If cache_hit dominance is not observed, residual timeouts are Render cold-start (G5).
counterfactuals:
  - If journal-URL fix requires identity auth changes touching identity surfaces, halt that lane and file a dissent note (G5 quarantined).
  - If swarm cron normalization degrades any consumer of swarm outputs, restore cadence and report.
  - If the 24h post-merge log comparison shows less than 40% error-volume reduction, acceptance fails and remaining noise sources are enumerated.
```
