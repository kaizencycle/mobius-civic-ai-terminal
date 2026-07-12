## EPICON-02 INTENT PUBLICATION

```intent
epicon_id: EPICON_C-370_TERMINAL_production-log-audit_v1
ledger_id: mobius:kaizencycle
scope: infra, api, docs
mode: normal
issued_at: 2026-07-12T21:00:00Z
expires_at: 2026-10-10T21:00:00Z
justification: |
  Direct production log review surfaced repeating failures in promote (401),
  ZEUS sweep (HTML parsed as JSON), and vault/status log attribution when
  invoked in-process from snapshot. Fixes close operational gaps independent
  of reserve-canon work in #608.

  VALUES INVOKED: integrity, observability, custodianship
  REASONING: cron/promote sent stale SUBSTRATE_TOKEN over valid CRON_SECRET;
  in-process promote + unified auth resolves without HTTP round-trip mismatch.
  ANCHORS:
  - docs/epicon/cycles/C-370/PRODUCTION_LOG_AUDIT_FIXES.md
  - lib/security/epiconPromoteAuth.ts
  - lib/http/safeJson.ts
  BOUNDARIES: Does not change reserve block export, cold canon, or GI mint gates.
counterfactuals:
  - If promote still 401 after deploy, verify CRON_SECRET alignment in Vercel env
  - If ZEUS sweep still fails, inspect journal route HTML responses upstream
```
