# C-322 — GitHub-federated KV cold tier

## Goal

Reduce Upstash command burn and survive **KV suspension** without inventing GI: keep **Upstash for hot + atomic paths**, add a **public GitHub `STATE/` tree** as a **read-through cold tier** and a **low-frequency mirror** from cron.

## What landed in Terminal (phase 1)

| Piece | Role |
|--------|------|
| `lib/github-state-cache.ts` | CDN `GET` + Contents `PUT` (409 retry once) |
| `loadGIState` / `loadGiTrend` in `lib/kv/store.ts` | After KV miss or transport error, read `STATE/gi/latest.json` / `STATE/gi/trend.json`; GI rows get `source: 'cached'` |
| `app/api/cron/heartbeat/route.ts` | If `GH_CACHE_REPO` + PAT configured, mirrors current **raw** `gi:latest` and `gi:trend` KV rows to GitHub (~12 writes/hr) |

## Mobius-Substrate (or any public archive repo)

Seed at least:

- `STATE/gi/latest.json` — valid `GIState` shape (see `lib/kv/store.ts`)
- `STATE/gi/trend.json` — JSON array of trend entries

Commits can use `[skip ci]` in the mirror message (already appended by `githubStateWriteJson`).

## Env (Vercel)

- `GH_CACHE_REPO` — **required** for reads (e.g. `Mobius-Substrate`)
- `GH_CACHE_OWNER` — defaults `kaizencycle`
- `GH_CACHE_BRANCH` — defaults `main`
- `GH_CACHE_PAT` — optional; falls back to `GITHUB_PAT`. Required for **heartbeat mirror writes**

## Operator truth

- Federated GI is explicitly `source: 'cached'` (not live KV).
- Do not point `GH_CACHE_REPO` at private data unless you accept auth/CORS tradeoffs on reads.

## Next phases (not in phase-1 code)

- Strip redundant `saveGIState` calls from high-QPS routes (shell, snapshot, digest) so **writes** drop, not only reads.
- Throttle / single-writer policy for additional keys (`mic:readiness`, tripwire heartbeats, etc.).
- Watch GitHub **secondary rate limits** on Contents API; batch or widen mirror cadence if needed.
