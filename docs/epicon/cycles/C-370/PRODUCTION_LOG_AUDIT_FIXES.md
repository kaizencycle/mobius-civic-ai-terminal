# C-370 Production Log Audit — Terminal Fixes

**EPICON:** `EPICON_C-370_TERMINAL_production-log-audit_v1`  
**Date:** 2026-07-12  
**Source:** Vercel production logs (08:51Z–20:51Z)

---

## Fixes in this PR

### 1. `cron/promote` 401 (P0)

**Root cause:** Internal HTTP fetch sent `SUBSTRATE_TOKEN` preferentially even when stale; `CRON_SECRET` (valid) was never used. Error log incorrectly blamed Identity introspect / `AGENT_SERVICE_TOKEN`.

**Fix:**
- In-process promote via `runEpiconPromoteCron()` (no HTTP round-trip)
- `getEpiconPromoteAuthError()` accepts CRON_SECRET → SUBSTRATE_TOKEN → service secrets
- `epiconPromoteAuthorizationHeader()` prefers **CRON_SECRET** over SUBSTRATE_TOKEN

**Verify after deploy:** `EPICON-C370-101`–`109` should move from `selected` → `promoted` on next cron tick.

### 2. `cron/sweep` ZEUS HTML-as-JSON (P0)

**Root cause:** Sweep HTTP-fetched `/api/agents/ledger-zeus`; journal sub-fetch could return HTML (redirect/error page), causing `SyntaxError: Unexpected token '<'`.

**Fix:**
- Sweep calls `getLedgerZeus` in-process with `x-mobius-invoker: cron/sweep`
- `parseResponseJson()` guards content-type before parse (shared with ledger-zeus journal fetch)
- Failures log `contentType` + body preview instead of cryptic SyntaxError

### 3. `vault/status` log attribution (P1)

**Root cause:** Snapshot invokes `getVault` in-process; Vercel `requestPath` shows parent route (`/api/terminal/snapshot`) while message reads `[vault/status]`.

**Fix:**
- Callers pass `x-mobius-invoker` header (snapshot sets `terminal/snapshot`)
- Timeout/error logs include `invoker=…` for audit trail disambiguation

### 4. GI divergence within `terminal/snapshot` (investigation)

**Finding:** Not a single bug — `topGi` resolves from `snapshot-lite` memory mode first, then falls back to `integrity-status`. Different cache/coalesce windows between parallel snapshot requests explain 0.78 / 0.81 / 0.91 within minutes.

**Action:** Snapshot success log now includes `giSource` and `agentsLaneOk` for correlation. Full GI unification remains #598 scope.

### 5. ATLAS credit exhausted (ops note)

Not a code fix. ATLAS API budget cooldown explains observation gaps during exhausted windows.

### 6. `agentCount: 0` on snapshot (observation)

**Finding:** `agentCount` derives from `agents/status` lane; when that lane times out (5s budget) within snapshot `Promise.all`, count is 0 while `journalCount` may still be populated from a faster lane. Added `agentsLaneOk` / `agentsLaneStatus` to snapshot log for confirmation.

### 7. `journal-canonize` `github_direct_write_configured: false` (confirmed)

**Intentional.** Production uses Civic Protocol Ledger (`RENDER_LEDGER_URL` / `CIVIC_LEDGER_URL`) as write path. `github_direct_write_configured` is `true` only when **no** substrate target is set **and** `GITHUB_TOKEN` is present — the direct-GitHub bypass path. Ledger-first is correct for this deployment.

---

## Tests

```bash
npx tsx tests/contract/epiconPromoteAuth.test.ts
npx tsx tests/contract/safeJson.test.ts
```
