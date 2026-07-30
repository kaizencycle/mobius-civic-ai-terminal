# C-388 — ATLAS implementation handoff: GI fallback provenance

**Status:** IMPLEMENTED (branch `cursor/c388-gi-fallback-provenance-0e02`)  
**Risk:** MEDIUM — journal text + MII source tagging + synthesis heartbeat skip; severity math unchanged  
**Human authority:** Michael Judan

## Executive intent

`0.74` (`GI_HEURISTIC_DEFAULT`) was reused at nine call sites as a silent substitute when no live GI resolved. Journal lines like `GI=0.74` were indistinguishable from measured readings (top bar showed `0.63` while cron journals claimed `0.74`). C-386 doctrine: **absence must not masquerade as measurement**.

## Design

- **Internal heuristics** still use `GI_HEURISTIC_DEFAULT` for thresholds (`gi < 0.72`, confidence formulas).
- **Journal text** uses `giLabel(gi, giIsLive)` → live `0.63` or `unavailable this cycle`.
- **`giIsLive`** threaded from `cycle-synthesize` fan-out through `atlas/observe`, `zeus/verify`, steward journals.
- **KV heartbeat** (`writeSynthesisCronHeartbeatKv`) skipped when no live GI resolves (no seeding next cycle with `0.74`).
- **MII writes** tag `source: 'live' | 'fallback'`.

## Files

| File | Change |
|------|--------|
| `lib/gi/provenance.ts` | Shared `GI_HEURISTIC_DEFAULT`, `giLabel`, parsers |
| `lib/agents/sentinel-cycle-journals.ts` | `giIsLive` on inputs; labeled observation text |
| `app/api/eve/cycle-synthesize/route.ts` | Fan-out + heartbeat skip |
| `app/api/agents/atlas/observe/route.ts` | KV override sets `giIsLive=true` |
| `app/api/agents/zeus/verify/route.ts` | Same |
| `app/api/cron/sweep/route.ts` | Pass `giIsLive` from sweep composite |
| `app/api/sentinel/zeus-reverify/route.ts` | KV-backed `giIsLive` |
| `lib/kv/mii.ts` | `source` union includes `fallback` |
| `tests/contract/giProvenance.test.ts` | Contract tests |

## Non-goals

- Retroactive relabel of historical journals
- Vault/Fountain GI gate (`≥ 0.95`)
- Pulse/Globe UI source badges (follow-on UX)

## Smoke test

Force `extractGiFromSynthesisPayload` null (malformed synthesis trace) → confirm ATLAS/ZEUS journals say `GI=unavailable this cycle` and heartbeat skip log appears; with live `loadGIState()` → journals show `0.63` (or current KV).

## Rollback

```bash
git revert <merge-sha>
```
