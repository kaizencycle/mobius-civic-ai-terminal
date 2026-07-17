# C-375 Terminal Log Hygiene — Witness Table

**Handoff:** ATLAS HANDOFF — C-375 Terminal Log Hygiene (Five-Lane Fix)  
**Cycle:** C-375  
**Witnessed at:** 2026-07-17T22:30:00Z  
**origin/main peeled SHA:** `1f4747128ee5ffb8d6a6d737b879827b5e320daf`  
**Target:** `kaizencycle/mobius-civic-ai-terminal`

---

## Per-lane verdict

| Lane | Verdict | Evidence |
| --- | --- | --- |
| 1 DEP0169 | **STOPGAP + DOCS** | No first-party `url.parse`; `docs/LOGGING.md` documents `NODE_OPTIONS=--disable-warning=DEP0169` for custodian |
| 2 ledger-zeus journal | **FIXED** | In-process `getJournal` in `ledger-zeus/route.ts`; `warningEscalation` at N=6 |
| 3 identity-token cache | **INSTRUMENTED** | `cache_hit` + `source: memory\|kv\|login` in `getAttestBearerToken`; login timeout 12s |
| 4 swarm cron | **NORMALIZED** | `resolveOperatorCycleId()`; tier>1 cap (`SWARM_MAX_TIER_GT1_PER_RUN`); cooldown state logs |
| 5 OG font | **FIXED** | `app/api/og/fonts/JetBrainsMono-Regular.woff2` + `ImageResponse` fonts option |

---

## Restraint row

- vault/status computation: **NOT TOUCHED**
- seal-integrity-gate 409 semantics: **NOT TOUCHED**
- identity-service (Render) deployment: **NOT TOUCHED**
- OAA broker integration for swarm: **NOT BUILT** (Phase 2)

---

## Post-merge acceptance (custodian)

1. Re-capture 24h Vercel log export; compare error fingerprints vs baseline
2. Apply `NODE_OPTIONS` on Vercel if DEP0169 persists
3. Verify `[identity-token] cache_hit: true` dominance on kv-watchdog runs
