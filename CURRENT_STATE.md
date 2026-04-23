# CURRENT_STATE.md — C-278
Last updated: 2026-04-12

## WORKING — DO NOT TOUCH
- `/api/agents/journal` reads cycle-scoped KV keys (`journal:{AGENT}:{CYCLE}`).
  Fixed in PR #248. Any change to key schema breaks the reader.
- `/api/echo/ingest` flushes EPICONs to `epicon:feed` after rating.
  Fixed in PR #246. Do not remove the LPUSH step.
- `/lib/substrate/github-reader.ts` includes `SUBSTRATE_GITHUB_TOKEN` auth header.
  Fixed in PR #246. Do not remove the `Authorization` header.
- `/api/epicon/feed` ledger API is no longer timing out (Render restored).
  `ledgerError: null` as of 2026-04-12. Do not add timeout workarounds.
- HERMES-µ market data source ownership: ECHO handles CoinGecko crypto prices.
  Do not add duplicate CoinGecko calls to HERMES signal sweep.

## IN PROGRESS
- Journal KV keys are empty (old keys expired). Agents repopulate on next synthesis run.
  `sources.kv` remains 0 until fresh `journal:{AGENT}:C-278` keys are written.
- DAEDALUS self-ping returns 401 — known, low priority, do not create PRs for this alone.
- Agent heartbeat freshness depends on cron cadence; do not seed fake heartbeats.

## KNOWN BROKEN — ASSIGNED
- `sources.kv = 0` on EPICON feed until first ECHO ingest post-deploy populates `epicon:feed`.
- If `PERPLEXITY_API_KEY` is missing in Vercel env, HERMES Sonar source is unavailable by design.
