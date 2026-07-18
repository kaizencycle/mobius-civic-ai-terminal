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
| 5 OG font | **FIXED** | `app/api/og/fonts/JetBrainsMono-Regular.ttf` + `ImageResponse` fonts option |

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

### Comparison methodology (C-375 addendum — deployment-ID filter)

**Do not compare by time window alone.** Cron runs that straddle a deploy contaminate before/after sets in both directions.

| Rule | Requirement |
| --- | --- |
| Cutover | Record merge SHA + first production deploy timestamp (PR #628 merged `1ddea643` at `2026-07-17T23:46:02Z`; deploy live ~`2026-07-17T23:50:00Z`) |
| Before set | Entries with `deploymentId` = **previous** production deploy (e.g. `dpl_EPeNsBa9…`) **or** timestamp strictly before cutover |
| After set | Every entry must carry the **new** `dpl_` ID from the post-merge deploy — reject stragglers on old ID even if timestamp is after cutover |
| Measurement window | 24h clock starts at cutover, not at capture time |
| DEP0169 lane | **UNVERIFIED** until after-set is filtered by new deploy ID **and** `NODE_OPTIONS=--disable-warning=DEP0169` is confirmed on Vercel |

**Incident (2026-07-17):** A five-entry capture at 23:30–23:50 UTC showed ledger-zeus warnings on deployment `dpl_EPeNsBa9…` while build log cloned `1ddea643` and finished "Deploying outputs…" at 23:49:49 UTC. Verdict: **STALE** (old code's last gasps), not **FALSE** (fix failing). Witness Protocol §1 "both directions fail" — render behind main.

Grab the new `dpl_` ID from the Vercel dashboard when it is the obvious latest production deployment; snapshot-lite exposes `commit_sha` only, not `deploymentId`.

---

| Lane 6 build-log KV noise | **FIXED** (this PR) | `rethrowIfDynamicServerUsage` in `lib/kv/store.ts`, `batchRead.ts`, `backup-redis.ts` |
