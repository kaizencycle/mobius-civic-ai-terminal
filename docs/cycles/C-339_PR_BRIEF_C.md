# C-339 — PR Brief C (Cursor / frontend plane) disposition

Repo head: **mobius-civic-ai-terminal**. Branch: `cursor/c-339-terminal-hardening`.

This record is the anti-padding deliverable required by the brief: *"Verify each
item; replace invalid items with documented findings rather than padding to 20."*
Each of the 16 terminal items below is marked **implemented**, **already-done**,
or **finding** (verified invalid / out-of-scope and replaced with a documented
finding). Nothing was padded to keep the count.

## Scope note — browser-shell items 17–20

Items 17–20 target the separate `mobius-browser-shell` repository, which is not
this workspace. They are out of scope for this PR and belong to the companion
`cursor/c-339-shell-hardening` PR per the brief's one-PR-per-repo model.

## Terminal items 1–16

| # | Item | Disposition | Evidence |
|---|------|-------------|----------|
| 1 | CURRENT_CYCLE/STATE drift | **implemented** | Frozen at C-326 / C-278 vs live C-339. `scripts/gen-cycle-docs.mjs` generates a managed runtime block from `ledger/cycle-state.json`; wired into `publish-cycle-state.yml`; CI `--check` gate. Doctrine preserved; no invented values. |
| 2 | PR archaeology → docs/history | **implemented** | `PR_C300_SUMMARY.md`, `PR_C305_AUREA_RUNTIME_TRUTH_SCAN.md` moved to `docs/history/`. |
| 3 | Manifest roster vs canon + CI | **finding** | The "10 sentinels" premise is not represented in this repo: `mobius.yaml` declares 8 active sentinels (`flow.agents.rate_limiters`) + `agent_affinity: [ZEUS, ATLAS]`. Canon verification already exists for the shards canon (`scripts/verify-canon.mjs` + `contract-tests.yml`, hashing `kaizen_shards.yaml` against upstream Substrate). A roster-specific check would need an authoritative Substrate roster URL; not fabricated here (operator-truth). Recommended follow-on: extend `verify-canon.mjs` to a published roster artifact once its canonical source is fixed. |
| 4 | `lib/env.ts` zod typed env | **implemented** | `lib/env.ts` (79 keys, typed, memoized), `assertEnv()` opt-in fail-fast; migrated `auth.ts` + `getSubstrateServiceConfig`. Deliberate deviation: not a global boot throw — the Terminal degrades gracefully on missing optional secrets (partial-degradation rule). |
| 5 | `vercel.json` deploy-skip | **already-done** + test | `vercel.json` already sets `ignoreCommand: scripts/ignore-build.sh` (C-305/C-314/C-335), which skips bot/sentinel/cursor/`[skip ci]`/cycle-state commits and force-builds operator/`[deploy]`. Added `tests/contract/ignoreBuild.test.ts` (9 cases) as the brief's acceptance test. |
| 6 | Strict build flags | **already-done** (pinned) | `next.config.ts` set neither flag, so Next defaults (`ignoreBuildErrors:false`, `ignoreDuringBuilds:false`) already enforced strict. Pinned both explicitly to prevent future relaxation; `pnpm build` green. |
| 7 | `.env.example` vs schema audit | **implemented** | `scripts/check-env-example.mjs` enforces 1:1 with `lib/env.ts`; surfaced 14 used-but-undocumented vars, now added. |
| 8 | Eliminate 7 `: any` | **implemented** | `lib/terminal/raw.ts` narrowing helpers; refactored `transforms.ts`, `stream.ts`, `macro-providers.ts`, `router/feedback/route.ts`. The 14 remaining `any` are isolated to the three.js `GlobeView3D` component (outside the item's `lib`/`app` scope). |
| 9 | Leveled logger, 17 `console.log` | **implemented** | `lib/log.ts` (LOG_LEVEL-gated). All 17 `console.log` in `app`/`lib` → `log.info`. `console.error` paths preserved. |
| 10 | dedupe + prune unused deps | **finding** | `pnpm dedupe --check` exits 0 (lockfile already deduped — no-op). Audited likely-unused deps (`ioredis`, `@vercel/kv`, `world-atlas`, `topojson-client`, `d3-geo`) are all imported. No safe removals; dependency churn avoided per change policy. Real signal: `@vercel/kv` and `recharts@2` are deprecated — flagged as a separate dependency-migration follow-on, not bundled into hygiene. |
| 11 | `docs/ROUTE_MANIFEST.md` in CI | **implemented** | `scripts/gen-route-manifest.mjs` → 211 routes, sorted, with methods; `--check` gate in `build-check.yml`. |
| 12 | Route tier tagging + CI flag | **implemented** (sidecar) | Convention supports inline `export const tier`; central `docs/route-tiers.json` is the fallback so 211 route files aren't churned (and avoids Next route-export risk). 21 verifiable tiers declared (13 cron from `vercel.json`, 8 public from `mobius.yaml`/`next.config`); 190 reported untiered for follow-on classification. Manifest carries the tier column. |
| 13 | Rate limiting on agent-gateway | **finding** | Out of scope this PR: the EPICON scope block forbids agent-gateway auth/behavior changes (C-333 OPT-1/OPT-2 untouched), there is no `middleware.ts`, and a correct limiter needs KV-backed design + budget-cap coordination. Recommended as its own scoped PR with its own EPICON block. |
| 14 | Remove `gateway.py` + `requirements.txt` | **finding (invalid)** | These are **not** dead. `render.yaml` deploys `uvicorn gateway:app` as the live `mobius-terminal-gateway` Render web service. Removing them would break a production deployment. Kept; do not remove. |
| 15 | Smoke tests for `getAgentBearerToken()` | **implemented** | Extracted to dependency-free `lib/substrate/agentToken.ts` (re-exported); `tests/contract/agentBearerToken.test.ts` (6 cases) covers the real function and the C-333 OPT-1 path. |
| 16 | build + typecheck as PR checks | **implemented** | `.github/workflows/build-check.yml`: typecheck → env audit → cycle-docs `--check` → route-manifest `--check` → build. Marking them *required* additionally needs branch-protection settings in the repo. |

## Net

- Implemented: 1, 2, 4, 7, 8, 9, 11, 12, 15, 16 (10 items).
- Already-done (verified + locked with a new test/pin): 5, 6 (2 items).
- Findings (verified invalid / out-of-scope, documented not padded): 3, 10, 13, 14 (4 items).

All 16 accounted for. typecheck / build / tests green (see PR body).
