# ATLAS × ZEUS HANDOFF — Production KV Witness Capture

**Cycle:** C-403  
**Repository:** kaizencycle/mobius-civic-ai-terminal  
**Predecessor:** PR #655  
**Phase:** Production evidence capture  
**Authority:** Authenticated production reads and evidence generation only  
**Production writes:** FORBIDDEN  
**Track R execution:** NOT AUTHORIZED

---

## Mission

Run the Track R evidence package against the actual production Upstash datastore and generate a complete, reproducible witness bundle suitable for ZEUS × EVE adjudication.

First prove datastore identity. Then derive the live collision set and retrieve every expected seal body. Do not proceed based merely on the presence of environment variables.

---

## Operator commands

```bash
# Local (production creds in .env.local — never commit)
pnpm track-r:production-capture

# GitHub Actions
# workflow: Track R Production Capture (workflow_dispatch)
```

---

## Required anchors

| Anchor | Expected |
|--------|----------|
| Latest seal ID | `seal-C-372-002` |
| Latest seal hash | `e19e9e44b32503a77b0c646b91a6780ffe9c42eafc3dad29e7758619b7500ef5` |
| Attested index count | 360 |
| Audit index count | 360 |
| Collision-pair count | 125 |
| Integrity gate | Active |

If anchors drift legitimately, stop and produce a drift report — do not silently replace expected values.

---

## Deliverables (artifact bundle)

| File | Purpose |
|------|---------|
| `TRACK_R_KV_IDENTITY_RECEIPT.json` | Redacted identity proof + deterministic hash |
| `TRACK_R_AFFECTED_BLOCK_COMPARISON.json` | Pinned vs live 123-position set |
| `TRACK_R_LIVE_WITNESS_COMPARISON_REDACTED.json` | Per-record MATCH/MISSING/MISMATCH |
| `TRACK_R_LIVE_DRY_RUN_PACKAGE.json` | Four-object attestation packet |
| ZEUS/EVE/HUMAN templates | Unsigned attestation placeholders |

---

## Fail-closed executive statuses

| Status | Meaning |
|--------|---------|
| `BLOCKED_PRODUCTION_KV_CREDENTIALS_NOT_CONFIGURED` | No approved KV creds in environment |
| `BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH` | Connected datastore ≠ production anchors |
| `BLOCKED_LIVE_AFFECTED_BLOCK_SET_UNAVAILABLE` | Cannot derive authoritative live set |
| `QUARANTINE_LIVE_COLLISION_UNIVERSE_DRIFT` | Live set ≠ pinned 123 positions |
| `BLOCKED_LIVE_WITNESS_INCOMPLETE` | Missing/incomplete export |
| `QUARANTINE_LIVE_WITNESS_MISMATCH` | Hash/body mismatch in witness |
| `QUARANTINE_BOUNDARY_41_42_FAILURE` | Live boundary check failed |
| `READY_FOR_ZEUS_EVE_REVIEW` | All gates pass — attestation may proceed |

---

Track R execution remains NOT AUTHORIZED. This capture proves—or fails to prove—the production lineage underlying the proposed repair. No production KV mutation, canonical promotion, integrity-gate clearance, candidate formation, or Reserve sealing occurred. ZEUS ADOPT, EVE ADOPT, explicit human consent, and a separate one-shot execution handoff remain mandatory.
