---
epicon_id: EPICON_C-372_GOVERNANCE_seal-attestation-flag_v1
title: "Seal attestation flag during KV block_number_collisions — C-372"
author_name: "Michael Judan (custodian)"
cycle: "C-372"
tier: "GOVERNANCE"
scope:
  domain: "governance"
  system: "civic-ai-terminal"
  environment: "mainnet"
epicon_type: "implementation-intent"
status: "proposed"
related_epicons:
  - "EPICON_C-370_EVE_kv-watchdog-implementation_v1"
tags:
  - "seal"
  - "attestation"
  - "block_number_collisions"
  - "vault"
  - "integrity-gate"
created_at: "2026-07-14T16:30:00Z"
summary: "Withhold pass attestation on in-flight seal candidates while KV watchdog reports critical block_number_collisions; auto-flag via cron and block pass at POST /api/vault/seal/attest."
---

# EPICON C-372 — Seal attestation flag during active collision alert

**Trigger:** EVE journal `KV watchdog critical: block_number_collisions` fired after `seal-C-372-002` formed with attestation window open.

**Action:** Enable seal integrity gate (custodian sign-off on C-370 hard-stop deferral).

## Evidence

| Journal | Signal |
|---------|--------|
| `EVE-C-372-1784043644374` | KV watchdog critical: block_number_collisions |
| `journal-ZEUS-C-372-zj3wm7` | GI layer divergence 0.70 vs 0.82 |
| `journal-ATLAS-C-372-mrklpoi7mi9x` | seed-kv fail 500, trust-tripwire elevated |
| `seal-C-372-002` | seal_hash `e19e9e44b32503a77b0c646b91a6780ffe9c42eafc3dad29e7758619b7500ef5` |

## Implementation

| Path | Change |
|------|--------|
| `lib/watchdog/sealIntegrityGate.ts` | Read `watchdog:kv:critical-alert`; activate on critical `block_number_collisions` |
| `app/api/vault/seal/attest/route.ts` | Reject `pass` with HTTP 423 when gate active |
| `app/api/cron/vault-attestation/route.ts` | Auto-attest `flag` (not `pass`); block next candidate formation |
| `lib/vault-v2/deposit.ts` | Block `tryFormNextCandidate` when gate active |

**Rollback:** `SEAL_INTEGRITY_GATE=off`

## Unblock criteria

1. `block_number_collisions` watchdog alert cleared with root cause identified
2. ATLAS GI vs integrity-status GI reconciled to single canonical value (recommended, not gate-enforced in v1)

---

> **Intent publication:** Use the combined intent in `EPICON_C-372_INFRA_journal-dedupe-seal-integrity_v1.md` for PR #622. This file is component documentation only.
