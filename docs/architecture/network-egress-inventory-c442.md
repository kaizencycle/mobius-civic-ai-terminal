# Network Egress Capability Inventory — C-442

**Status:** Read-only inventory (HERMES discovery phase, C-442 Agent Egress Observability)
**Method:** Static code reading only. No destinations were probed, no requests were made to produce this document.
**Purpose:** A capability map, not a vulnerability report. This document describes what outbound network capability already exists in this codebase and who/what can invoke it. It does not judge any of it as wrong.

---

## Summary

Roughly **60 distinct network-capable code paths** exist in this repo (grouped by destination/purpose; a raw `fetch(` grep hits ~173 files, but most of those are client components making same-origin relative calls to this app's own `/api/*` routes — internal, not itemized below). Rough breakdown by classification:

- **SYSTEM_FIXED** (~40): the Civic Protocol Core ledger, Identity service, OAA broker, GitHub Contents/Actions API, ~45 free public data APIs polled by ATLAS/HERMES/DAEDALUS/GAIA/THEMIS micro-agents (see `docs/architecture/microagent-public-endpoints.md`), Finviz scraper, Slack API, Perplexity Sonar, Anthropic/DeepSeek LLM APIs.
- **CRON_FIXED** (~15): the same SYSTEM_FIXED paths as reached via the 17 Vercel cron routes (sweep, gi-refresh, echo-ingest, swarm, vault-attestation, reattest-seals, publish-oaa-snapshots, reserve-canon-append/integrity, track-r-p3-governance-intake, watchdog, attest-sweep, eve/cycle-synthesize).
- **USER_INITIATED** (~5): routes like `/api/mic/account`, `/api/identity/me` that call out to Render services on a page/API request.
- **AGENT_SELECTED** (1 clear-cut case): `POST /api/crawler/integrity-scan` — accepts an arbitrary `url` in the request body and fetches it (SSRF-guarded: blocks localhost/RFC1918 ranges, re-validates redirect targets). This is the one genuine "browse any URL" capability in the codebase.
- **UNKNOWN/mixed** (a few): internal same-origin fan-outs, and standalone SDK/adapter packages outside the Next.js runtime.

No secret *values* were read, printed, or guessed anywhere in this inventory — only environment variable *names*.

---

## Ledger client (civic-protocol-core-ledger)

Three-to-four independent write paths all target the same Render-hosted ledger, each resolving its base URL via a slightly different env-var priority chain:

1. **`lib/substrate/client.ts`** — primary client.
   - `resolveSubstrateLedgerUrl()` (L122–148): `RENDER_LEDGER_URL` → `CIVIC_LEDGER_URL` → `NEXT_PUBLIC_SUBSTRATE_API_BASE` → hardcoded fallback `https://civic-protocol-core-ledger.onrender.com`.
   - `attestToLedger()` (L273–447): `POST {LEDGER_BASE}/ledger/attest` (L333, retried on 401 at L355). Auth: `Authorization: Bearer <token>` minted by `getAttestBearerToken()`, falling back to static `AGENT_SERVICE_TOKEN`/`RENDER_API_KEY` via `getAgentBearerToken()` (L419, `lib/substrate/agentToken.ts`).
   - Fire-and-forget MIC-earn call in the same function: `POST {MIC_WALLET_URL|RENDER_MIC_URL}/mic/earn` (L421).
   - `probeSubstrateService()` (L45–75): health probes to `MOBIUS_LEDGER_URL|MOBIUS_GI_URL|MOBIUS_MIC_URL|MOBIUS_BROKER_URL|MOBIUS_OAA_URL`.
   - Trigger: `sweep`, `swarm`, `vault-attestation`, `reattest-seals`, `eve/cycle-synthesize` crons. **CRON_FIXED**.
2. **`lib/terminal/attest.ts`** — `attestToSubstrate()` (L16–56). `POST {CIVIC_LEDGER_URL}`, `Authorization: Bearer <identity JWT>`. **CRON_FIXED / SYSTEM_FIXED**.
3. **`lib/seal/issueSeal.ts`** — `issueSeal()` (L3–27). `POST {CIVIC_LEDGER_URL}` directly — **no Authorization header attached at all**, unlike every other ledger writer. Caller not traced in this pass. **UNKNOWN** (flagged for follow-up — dead code vs. an unreached live path was not resolved).
4. **`lib/cpc/hashAnchor.ts`** — CPC hash-anchor client, distinct from ledger-attest (stores hash proofs only). `postHashAnchor()` (L62–122): `POST {base}/api/canon/reserve-blocks/anchor`, `Authorization: Bearer AGENT_SERVICE_TOKEN`. `fetchCpcManifest()` (L144–159): unauthenticated public read. **CRON_FIXED**.
5. **`lib/vault-v2/reserveBlockDispatch.ts`** — after 5-of-5 quorum seal: `postCpcAnchor()` (L57+, no auth header shown) plus a `repository_dispatch` to `kaizencycle/Civic-Protocol-Core` using `SUBSTRATE_GITHUB_TOKEN`. **CRON_FIXED**.
6. **`lib/dat/substrateCanonGap.ts`** — `fetchCanonGap()` (L23–79): self-referential `GET {TERMINAL_API_BASE|https://mobius-civic-ai-terminal.vercel.app}/api/vault/status`, plus a public, unauthenticated `GET https://raw.githubusercontent.com/kaizencycle/Mobius-Substrate/main/canon/reserve-blocks/MANIFEST.json`. **CRON_FIXED**.
7. **Identity JWT minting — `lib/substrate/identityToken.ts`** (feeds the ledger-attest bearer token):
   - `identityBase()` (L51–61): `IDENTITY_API_BASE` → `IDENTITY_SERVICE_URL` → `RENDER_IDENTITY_URL` → hardcoded `https://mobius-identity-service.onrender.com`.
   - `wakeIdentityService()` (L84–97): `GET {base}/health` — Render cold-start wake.
   - `loginOnce()` (L126–152): `POST {base}/auth/login` with `{ email, password }` — credentials sourced from `IDENTITY_SERVICE_EMAIL`/`IDENTITY_SERVICE_PASSWORD` env vars. **This is the one path that transmits a username/password body**, not just a bearer token. Response `access_token` cached in memory + KV. **CRON_FIXED / SYSTEM_FIXED**.
8. **`app/api/identity/me/route.ts`**, **`app/api/mic/account/route.ts`** — server-side calls to `RENDER_IDENTITY_URL`/`RENDER_MIC_URL` made per human/browser request. **USER_INITIATED**.

## GDELT / signal ingestion

GDELT (`api.gdeltproject.org`) is called from three independent places:

- `lib/eve/global-news.ts:461` — `fetchGDELTGlobal()`. Feeds EVE global-news synthesis (`lib/echo/sources.ts`, `app/api/eve/*`). **CRON_FIXED** (echo-ingest, eve/cycle-synthesize). This is the exact call site named in the C-442 evidence trigger (`api.gdeltproject.org` timeout).
- `lib/agents/micro/hermes.ts:187` — `pollGDELT()`, HERMES-µ3 micro-instrument, falls back to HN Algolia on failure. **CRON_FIXED** (sweep).
- `lib/agents/micro/instrument-polls.ts:385` — another GDELT query variant, falls back to GitHub trending. **CRON_FIXED**.

All three are read-only, no auth, fixed query strings.

## OAA broker

The sovereign-memory KV bridge/broker (`.env.example` documents `https://oaa-api-library.onrender.com` as `NEXT_PUBLIC_OAA_API_URL`).

- Base URL resolution repeated across 3 files: `OAA_API_BASE_URL` → `OAA_API_BASE` → `NEXT_PUBLIC_OAA_API_URL` → `''` (unconfigured ⇒ no-op): `lib/kv/kvBridgeClient.ts`, `lib/mesh/loadMobiusYaml.ts`, `lib/ingestion/OAADataClient.ts`.
- `lib/kv/kvBridgeClient.ts` — warm KV fallback: `kvBridgeWrite()`/`kvBridgeRead()`, `Authorization: Bearer KV_BRIDGE_SECRET`. Fire-and-forget mirror on every KV write when Upstash degrades. **SYSTEM_FIXED**.
- `lib/oaa/publishSnapshot.ts` — dual-write pipeline: internal snapshot read → `OAADataClient.write()` (HMAC-signed via `lib/oaa/signWrite.ts`, secret `OAA_HMAC_SECRET`/`KV_HMAC_SECRET`) → `postMobiusIngest()` forwards a proof to the durable ledger ingest URL. Trigger: `/api/cron/publish-oaa-snapshots` (every 30 min), gated by `isOaaPublishEnabled()`. **CRON_FIXED**.
- `lib/mesh/ingestClient.ts` — `postMobiusIngest()`: `POST` to a URL resolved from `mobius.yaml` `ingest.targets[0].write_url` or `MOBIUS_INGEST_WRITE_URL`; bearer chain `MOBIUS_INGEST_BEARER_TOKEN` → `AGENT_SERVICE_TOKEN` → `MOBIUS_SERVICE_SECRET`. **SYSTEM_FIXED**.

No literal `oaa-api-library` hostname appears at any call site — the broker base always resolves through the `OAA_API_BASE*` env-var chain, defaulting to unconfigured (no-op) rather than a hardcoded broker URL.

## Cron-triggered egress (per `vercel.json`)

| Cron path | Outbound network? | Destination(s) |
|---|---|---|
| `/api/cron/heartbeat` | Yes | GitHub Contents API mirror when `GH_CACHE_*` configured; otherwise KV-only |
| `/api/cron/promote` | No direct egress | Runs `/api/epicon/promote` **in-process** (`lib/cron/runEpiconPromote.ts` calls the route handler function directly — no HTTP round-trip) |
| `/api/cron/vault-attestation` | Yes | Ledger (`lib/substrate/client.ts`), CPC substrate-attestation, GitHub journal parcel flush (gated by `JOURNAL_FLUSH=on`), reserve-block dispatch |
| `/api/cron/sweep` | Yes | `lib/signals/runMicroSweep.ts` → `pollAllMicroAgents()` → ~30+ public data APIs; MIC readiness assembly |
| `/api/cron/swarm` | Yes | `api.anthropic.com` (tiers 2–3), `OPENAI_COMPAT_BASE_URL` (default `api.deepseek.com`, tier 1) |
| `/api/cron/reserve-canon-append` | Yes | GitHub Actions `workflow_dispatch` (`lib/dat/dispatchCanonExport.ts`), `SUBSTRATE_GITHUB_TOKEN`\|`GITHUB_TOKEN`\|`MOBIUS_BOT_GITHUB_TOKEN`; plus `fetchCanonGap()` (self `/api/vault/status` + GitHub raw MANIFEST.json) |
| `/api/cron/reserve-canon-integrity` | Yes | Same `fetchCanonGap()` path (read-only) |
| `/api/cron/journal-canonize` | Yes (indirect) | `processJournalCanonOutbox()`, `readAllSubstrateJournals()` (`lib/substrate/github-reader.ts`) — GitHub reads of the Substrate repo journal tree |
| `/api/cron/publish-oaa-snapshots` | Yes | OAA + ledger dual-write, see OAA section |
| `/api/cron/reattest-seals` | Yes | `lib/vault-v2/substrate-attestation.ts` (ledger POST via `writeToSubstrate`), `backAttestSeal` |
| `/api/cron/echo-ingest` | Yes (2 layers) | Route does one internal fan-out `POST {origin}/api/echo/ingest`; inner route calls `lib/echo/sources.ts`: GovTrack RSS, USGS earthquake GeoJSON, CoinGecko price API, plus GDELT/Wikipedia via `lib/eve/global-news.ts` |
| `/api/cron/gi-refresh` | Yes | `runSignalEngine()` → polls the ~45-entry `lib/signals/registry.ts` instrument list |
| `/api/eve/cycle-synthesize` | Yes | `runSignalEngine()` (same registry) + internal same-origin fan-out to `/api/agents/atlas/observe`, `/api/agents/zeus/verify`, `/api/epicon/promote` |
| `/api/cron/kv-watchdog` | No external egress found | KV-internal health checks only |
| `/api/cron/watchdog` | Yes | `lib/watchdog/batchRepair/computeFreshLineageSnapshotFromProduction.ts` — `GET https://mobius-civic-ai-terminal.vercel.app/...` (self, hardcoded fallback) |
| `/api/cron/track-r-p3-governance-intake` | Yes (via lib) | `runTrackRP3GovernanceIntakeCron.ts` → `verifyTrackRExecutionReadiness.ts` also hits the hardcoded production Vercel URL |
| `/api/vault/block/attest-sweep` | Yes | `backAttestSeal()`, `attestReserveBlockToSubstrate()` (ledger POST), substrate retry-queue drain |

**LLM egress (`app/api/cron/swarm/route.ts`):** `getClient()` builds an Anthropic client (`ANTHROPIC_API_KEY`, `api.anthropic.com`); `getOpenAICompatClient()` builds an OpenAI-compatible client at `OPENAI_COMPAT_BASE_URL` (default `https://api.deepseek.com`). Tier→provider mapping (`lib/swarm/activation.ts`): tier 1 → deepseek-v4-flash; tiers 2–3 → claude-sonnet-4-6/claude-opus-4-7. Each of 10 sentinel agents conditionally activates per fixed `ACTIVATION_CONDITIONS` with a fixed system instruction — **the destination is fixed by tier, not agent-chosen**, so this classifies **CRON_FIXED**, though the LLM call *content* is signal-driven.

Two more direct Anthropic callers outside swarm: `lib/eve/synthesize-claude.ts` (`callClaudeForEveSynthesis`) and `lib/integrity/claude.ts` (`callClaudeJson`, reused by `jade/verify-claim`, `hermes/aeo-check`, `hermes/geo-check`) — both **USER_INITIATED / API-triggered**, not cron.

## Agent-invocable network tools

**`POST /api/crawler/integrity-scan`** (`app/api/crawler/integrity-scan/route.ts`, backed by `lib/crawler/sourceAuditor.ts`) — **the one clear "fetch an arbitrary URL" tool in this codebase.**

- Accepts `{ url, purpose, cycle }` in the request body.
- `auditPublicSource()` → `normalizeAllowedUrl()` blocks `localhost`/`127.0.0.1`/`0.0.0.0`/`::1` and RFC1918 private ranges, else allows any `http:`/`https:` URL.
- `fetchPublicUrlWithRedirectValidation()` manually follows up to 3 redirects, re-validating each `Location` target against the same allowlist before following it.
- Response body capped at 120KB, 10s timeout, custom User-Agent `Mobius-Integrity-Source-Auditor/0.1`.
- Auth: `requireWriteAuth()` requires an `AGENT_SERVICE_TOKEN`/`CRON_SECRET`/`MOBIUS_WRITE_TOKEN` bearer on POST.
- Documented as `agent: 'HERMES'`, `mode: 'operator_triggered'`.
- **Classification: AGENT_SELECTED** — the destination is a runtime parameter, not fixed by code. This is the single path matching "browser/search tool exposed to an agent," and the instrumentation added in this PR demonstrates NET_EGRESS attribution concretely on this one route (see `app/api/crawler/integrity-scan/route.ts`).

No other MCP tool (`lib/mcp/mobius-terminal-mcp.ts`) reaches outside the app — all its `fetchInternalJson()` calls resolve to same-origin URLs only.

`lib/agents/micro/jade-internet-archive.ts` fetches a **fixed** query target (`archive.org/wayback/available?url=<this app's own domain>`) — not a general browse tool. **SYSTEM_FIXED**.

## Micro-agent instrument polls (cron-fixed, ~45 public data sources)

Full canonical table already exists at `docs/architecture/microagent-public-endpoints.md` (40 curated public-API instruments). Triggered by `/api/cron/sweep` (→ `pollAllMicroAgents()`) and `/api/cron/gi-refresh` (→ `lib/signals/registry.ts`, ~45 entries: World Bank, NASA EONET, NOAA, USGS, weather.gov, arXiv, CrossRef, GitHub, npm registry, Cloudflare/Netlify status, Let's Encrypt directory, PyPI, Harvard Dataverse, GBIF, PubMed, and more). All read-only GETs to free/no-auth public APIs with fixed URLs, except `lib/agents/micro/themis.ts` (data.gov `api_key` env var) and `lib/signals/registry.ts`'s congress.gov entry (`DEMO_KEY` literal, not a secret).

## Other internal HTTP helper modules

- **`lib/markets/finvizAdapter.ts`** — HTML-scraping crawler, `FINVIZ_BASE = 'https://finviz.com'`, custom User-Agent, raw HTML parsing. A second, distinct crawler module from `lib/crawler/sourceAuditor.ts`. Trigger chain not fully traced — flagged for follow-up.
- **`lib/treasury/cross-check.ts`, `deep-composition.ts`, `watch.ts`** — `api.fiscaldata.treasury.gov`, fixed URLs, no auth. **CRON_FIXED/SYSTEM_FIXED**.
- **`lib/evidence/brokerClient.ts`** — "thought-broker" evidence packet client. `brokerBaseUrl()`: `MOBIUS_BROKER_URL` → `RENDER_THOUGHT_BROKER_URL` → `NEXT_PUBLIC_THOUGHT_BROKER_URL` → `http://localhost:4005`. Auth: `BROKER_API_KEY`/`API_KEY` as `x-api-key`. **USER_INITIATED**.
- **`lib/globe/renderProviders/nanoBanana.ts`** — Replicate-hosted image generation. `NANO_BANANA_BASE_URL`/`NANO_BANANA_API_KEY`, `Authorization: Token <key>`. Unconfigured by default. **USER_INITIATED**, exact trigger route not traced.
- **`lib/github-state-cache.ts`** — GitHub-backed cold tier: `githubStateReadJson()` (public raw-content read), `githubStateWriteJson()` (`Authorization: Bearer GH_CACHE_PAT|GITHUB_PAT`). Trigger: `/api/cron/heartbeat` when `GH_CACHE_REPO`+PAT configured. **CRON_FIXED**.
- **`lib/dat/dispatchCanonExport.ts`** — GitHub Actions `workflow_dispatch`, `SUBSTRATE_GITHUB_TOKEN`/`GITHUB_TOKEN`/`MOBIUS_BOT_GITHUB_TOKEN`. Triggered by `/api/cron/reserve-canon-append`. **CRON_FIXED**.
- **`lib/substrate/github-reader.ts`** — reads the Substrate GitHub repo journal tree, used by `journal-canonize` and `kv-watchdog`. **This module carries the "Substrate GitHub auth header" this repo's own PR template calls LOCKED BEHAVIOR — not modified by this PR.** **CRON_FIXED**.
- **`app/api/github/webhook/route.ts`** — inbound only (GitHub sends webhooks to this app); not outbound egress, noted for completeness.
- **`lib/slack-agent/postSlackReply.ts`** — `POST https://slack.com/api/chat.postMessage`, `Authorization: Bearer SLACK_BOT_TOKEN`. **USER_INITIATED** (replies to a Slack command). `lib/slack-agent/githubOps.ts` additionally performs GitHub draft-PR + `workflow_dispatch` operations.

## Environment variables referencing external services

Non-exhaustive but covers all `*_URL`/`*_API`/`*_ENDPOINT`/`*_HOST`/`*_BROKER`/`*_WEBHOOK` matches in `.env.example` / `lib/env.ts`:

`NEXT_PUBLIC_MOBIUS_API_BASE`, `NEXT_PUBLIC_MOBIUS_GATEWAY_URL`, `NEXT_PUBLIC_SUBSTRATE_API_BASE`, `CIVIC_LEDGER_URL`, `CPC_BASE_URL`, `RENDER_LEDGER_URL`, `NEXT_PUBLIC_CIVIC_LEDGER_URL`, `JOURNAL_CANON_SUBSTRATE_TARGET`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CANONICAL_URL`, `NEXT_PUBLIC_TERMINAL_URL`, `TERMINAL_API_BASE`, `NEXT_PUBLIC_MESH_GATEWAY_URL`, `MOBIUS_INGEST_WRITE_URL`, `MOBIUS_INGEST_BEARER_TOKEN`, `OAA_API_BASE`, `OAA_API_BASE_URL`, `NEXT_PUBLIC_OAA_API_URL`, `OAA_HMAC_SECRET`, `KV_BRIDGE_SECRET`, `NEXT_PUBLIC_THOUGHT_BROKER_URL`, `RENDER_THOUGHT_BROKER_URL`, `MOBIUS_BROKER_URL`, `BROKER_API_KEY`, `NEXT_PUBLIC_GIC_INDEXER_URL`, `RENDER_GIC_URL`, `NEXT_PUBLIC_MIC_WALLET_URL`, `MIC_WALLET_URL`, `RENDER_MIC_URL`, `NEXT_PUBLIC_IDENTITY_URL`, `IDENTITY_SERVICE_URL`, `RENDER_IDENTITY_URL`, `IDENTITY_API_BASE`, `IDENTITY_SERVICE_EMAIL`, `IDENTITY_SERVICE_PASSWORD`, `NEXT_PUBLIC_LAB4_URL`, `NEXT_PUBLIC_LAB6_URL`, `NEXT_PUBLIC_LAB7_URL`, `AGENT_SERVICE_TOKEN`, `SUBSTRATE_TOKEN`, `RENDER_API_KEY`, `SEAL_TOKEN`, `SEAL_ISSUE_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REDIS_URL`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `GITHUB_TOKEN`, `SLACK_AGENT_GITHUB_REPO`, `SLACK_AGENT_GITHUB_REF`, `SLACK_AGENT_GITHUB_BASE`, `MOBIUS_HANDBOOK_CORS_ORIGINS`, `GH_CACHE_OWNER`, `GH_CACHE_REPO`, `GH_CACHE_BRANCH`, `GH_CACHE_PAT`, `DAEDALUS_APP_ID`, `DAEDALUS_APP_KEY`, `MOBIUS_SUBSTRATE_GITHUB_REPO`, `SUBSTRATE_GITHUB_TOKEN`, `MOBIUS_LEDGER_URL`, `MOBIUS_GI_URL`, `MOBIUS_MIC_URL`, `MOBIUS_BROKER_URL`, `MOBIUS_OAA_URL`, `ANTHROPIC_API_KEY`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_BASE_URL`, `PERPLEXITY_API_KEY`, `NANO_BANANA_API_KEY`, `NANO_BANANA_BASE_URL`, `MOBIUS_SHELL_URL`.

## Open questions (not resolved by this inventory)

- **`lib/seal/issueSeal.ts`** posts to `CIVIC_LEDGER_URL` with no Authorization header, unlike every other ledger writer — caller not found in this pass. Dead code vs. an unreached live path is unresolved.
- **`lib/markets/finvizAdapter.ts`** — fetch call and destination confirmed; the cron/route that ultimately invokes it was not traced.
- **`lib/globe/renderProviders/nanoBanana.ts`** — client confirmed; the specific route/user action that triggers image generation was not traced.
- **`packages/adapters/*`** (Moltbook, OpenClaw, Bots-of-Wall-Street) — no `fetch(`/URL literal found; likely mock/local-data only in the current tree.
- **`sdk/mobius_agent.py`** — a standalone Python client library for other processes to call this app; outside the Next.js/Vercel runtime this inventory covers.
- Client-component `fetch(` call sites (~90 of the ~173 raw hits) were sampled, not exhaustively traced; all samples resolved to relative same-origin paths.

---

*Produced for C-442 (Agent Egress Observability). OBSERVE phase — this document changes no runtime behavior.*
