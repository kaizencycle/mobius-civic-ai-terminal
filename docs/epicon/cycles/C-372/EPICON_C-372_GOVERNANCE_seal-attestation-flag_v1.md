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

```intent
epicon_id: EPICON_C-372_GOVERNANCE_seal-attestation-flag_v1
ledger_id: kaizencycle
scope: governance
mode: enforce
issued_at: 2026-07-14T16:30:00Z
expires_at: 2026-07-28T16:30:00Z
justification:
  VALUES INVOKED: integrity, witness, custodianship
  REASONING: Withhold pass attestation on seal-C-372-002 and subsequent candidates while KV watchdog reports critical block_number_collisions. Sealing 298 entries into a namespace with active collision alerts risks repeating the C-370/C-371 chain-continuity incident with fresh quorum signatures. Custodian sign-off closes the C-370 open decision to defer hard-stop sealing.
  ANCHORS:
    - docs/epicon/cycles/C-372/EPICON_C-372_GOVERNANCE_seal-attestation-flag_v1.md
    - docs/epicon/cycles/C-370/GOVERNANCE_DECISION_C-370_chain-continuity.md
    - docs/epicon/cycles/C-370/EPICON_C-370_EVE_kv-watchdog-implementation_v1.md
    - journal:EVE-C-372-1784043644374
    - seal:seal-C-372-002
  BOUNDARIES: Gate blocks pass verdicts and new candidate formation only. Flag and reject remain allowed. Does not mutate existing attested seals. Rollback via SEAL_INTEGRITY_GATE=off. Does not implement Q2 resilientSet/appendSealToChain fixes.
  COUNTERFACTUAL: If Intent Publication Gate rejects this block, correct scope and I6 fields per EPICON-02 before merge.
counterfactuals:
  - If gate blocks finalization indefinitely, sentinels may attest flag until timeout; quarantine path remains available.
  - If collision alert is stale KV artifact, clearing watchdog state unblocks without code deploy.
  - If operator prefers manual flag-only without code gate, set SEAL_INTEGRITY_GATE=off and attest via /api/vault/seal/attest manually.
```
