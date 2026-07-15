# C-373 — Vault/KV Canonical Lineage Recovery

**EPICON:** `EPICON_C-373_ATLAS_vault-kv-canonical-lineage-recovery_v1`  
**Agent:** ATLAS · **Witness:** EVE · **Challenger:** ZEUS  
**Human merge authority:** Michael Judan  
**Severity:** CRITICAL · **Mode:** recovery

---

## EPICON-02 Intent

```intent
epicon_id: EPICON_C-373_ATLAS_vault-kv-canonical-lineage-recovery_v1
cycle: C-373
agent: ATLAS
witness: EVE
challenger: ZEUS
scope: vault,kv,watchdog,seal-lineage,latest-seal-pointer
severity: critical
mode: recovery
human_approval_required: true
rollback_required: true
issued_at: 2026-07-15T14:30:00Z
expires_at: 2026-10-13T14:30:00Z
justification: |
  VALUES INVOKED: integrity, transparency, safety, provenance
  REASONING: EVE C-373 critical watchdog findings (latest_seal_key_present, block_number_collisions)
  require deterministic collision evidence export, append-only reconciliation receipts, and guarded
  repair of derived canonical indexes and LATEST_SEAL_KEY — without deleting, renumbering, or rewriting
  sealed attested records. UI and deduplicated export views are not canonical authority.
  ANCHORS:
    - lib/watchdog/kvHealthChecks.ts (C-370 watchdog)
    - lib/watchdog/sealIntegrityGate.ts (C-372 gate — remains enabled)
    - lib/dat/reserveBlockCollisions.ts (deterministic preference rule)
    - docs/epicon/cycles/C-370/AUDIT_C-370_reserve-block-collisions.md
  BOUNDARIES: Does not set SEAL_INTEGRITY_GATE=off. Does not mutate sealed seal bodies.
  Does not clear watchdog:kv:critical-alert except via normal live-report resolution path.
  COUNTERFACTUAL: If hash-divergent collisions cannot be reconciled against Substrate/Civic evidence,
  receipts remain proposed and gate stays active — silence is not repair.
counterfactuals:
  - If ZEUS challenges canonical winner, receipt moves to challenged/rejected — no --apply
  - If KV seal hashes change after audit, repair fails closed (stale snapshot)
  - Rollback derived pointer/index mutations only via mutation journal pre-repair state
```

---

## Constitutional boundary

**No UI-derived truth. Canon → Ledger → UI.**

---

## Proof requirements (operator)

| Artifact | Path / command |
|----------|----------------|
| Pre-repair watchdog | `GET /api/cron/kv-watchdog` or production cron output |
| Collision audit JSON | `pnpm watchdog:collision-audit --json --out artifacts/C-373/pre-repair-audit.json` |
| Reconciliation receipt | `artifacts/C-373/receipts/rcpt-*.json` (human + ZEUS + EVE approved) |
| Repair dry-run | `pnpm watchdog:collision-repair --receipt <path>` |
| Repair apply | `pnpm watchdog:collision-repair --receipt <path> --apply` |
| Post-repair watchdog | clean `block_number_collisions` + `latest_seal_key_present` |
| Deployment SHA | must match merged commit after intentional production deploy |
| Tests | `pnpm test` |

---

## Rollback

1. Read `watchdog:collision:mutation-journal` for pre-repair `before` values.
2. Restore `vault:seal:latest` and `watchdog:canonical:block:*` from journal entries only.
3. Never delete reconciliation receipts or original `vault:seal:{id}` records.

---

*"We heal as we walk." — Mobius Systems*
