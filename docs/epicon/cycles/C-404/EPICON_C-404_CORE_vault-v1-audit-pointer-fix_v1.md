# EPICON_C-404_CORE_vault-v1-audit-pointer-fix_v1

**Cycle:** C-404  
**Scope:** core  
**Status:** published — non-executable intent  
**Authority:** read-only audit fix; `execution_authorized: false`

---

```intent
epicon_id: EPICON_C-404_CORE_vault-v1-audit-pointer-fix_v1
ledger_id: kaizencycle
scope: core
mode: normal
issued_at: 2026-08-23T15:45:00Z
expires_at: 2026-11-23T15:45:00Z

justification:
  VALUES INVOKED: Operator truth over illusion; vault quarantine must reflect real legacy seals, not CAS pointer keys.
  REASONING: Canon `reattest-bulk` and migrate-v1 audit paths naively treated KV rows under `vault:seal:latest` as legacy v1 bodies when the sample lacked `schema_version`. The `latest` suffix is a reserved CAS pointer key, not a seal record. Centralizing `listV1SealIdsFromKvInspect()` excludes reserved pointer keys before v1 parsing, eliminating the false `v1Seals: ["latest"]` quarantine signal while preserving real v1 detection.
  ANCHORS:
    - lib/vault-v2/reservedSealIds.ts (listV1SealIdsFromKvInspect, RESERVED_VAULT_SEAL_IDS)
    - docs/epicon/cycles/C-404/cas-probes/OPERATOR-PROBE-2026-08-23.md (production false positive evidence)
    - docs/runbooks/vault-seal-latest-pointer-repair.md (pointer key semantics)
  BOUNDARIES: Read-only audit classification only. No KV writes, no migrate-v1 execution, no seal mutation, no Track R batch-apply authority, no GI/MIC/MII changes.
  COUNTERFACTUAL: If real v1 seals stop appearing in audit after deploy, revert and inspect parseV1SealRecord edge cases; if `latest` still surfaces as v1, reserved-id filter regressed.

counterfactuals:
  - If migrate-v1 or reattest-bulk still lists `latest` after deploy, revert listV1SealIdsFromKvInspect and re-audit KV inspect samples.
  - If legitimate v1 seals are excluded, verify they are not stored under reserved suffixes and extend tests before re-merge.
  - Rollback is git revert of lib/vault-v2/reservedSealIds.ts call sites only; no production KV cleanup required.
```

---

## Summary

Fixes false v1 quarantine detection caused by treating CAS pointer keys (`latest`, `candidate`) as legacy seal bodies during KV inspect audit.

## Changed surfaces

- `lib/vault-v2/reservedSealIds.ts` — `listV1SealIdsFromKvInspect()`
- `app/api/vault/migrate-v1/route.ts` — uses centralized list
- `app/api/vault/reattest-bulk/route.ts` — uses centralized list
- `tests/contract/migrateV1Guard.test.ts` — contract coverage

## Rollback

```bash
git revert <commit-sha>
# No KV cleanup; audit paths revert to prior behavior
```
