# CURRENT_CYCLE.md — C-281 (close)

> **Last verified:** 2026-04-15T00:09Z (operator close snapshot)  
> **Reference production SHA:** `bca99e86` (Vault v1 + prior C-281 work; this PR advances close-out items)  
> **Production URL:** https://mobius-civic-ai-terminal.vercel.app  
> **Vercel project:** `prj_ru2eaIzY0nIamFIXEdUIuTjnefpn` · team `team_cEncfJHYpxuB6YiFQNwdOUB5`

---

## ⚠️ READ THIS FIRST — FOR ALL AGENTS (Cursor, Codex, Claude Code)

This file is the **ground truth** for the current state of the Terminal repo.  
Before making any change, read this file in full.  
If your task conflicts with a **LOCKED** entry, **stop and ask the operator**.

---

## ✅ CONFIRMED WORKING (C-281 close)

| Area | State | Notes |
|------|-------|--------|
| Snapshot | healthy | `ok: true`, `cycle: C-281` |
| Integrity | degraded / nominal band | GI ~0.83, source **kv**, mode green where applicable |
| MII feed | healthy | 200-entry read window; LTRIM 500; 8 agents in feed |
| Vault lane | live | `GET /api/vault/status` + snapshot `vault` lane |
| Journal KV | high volume | ~97 hot-lane entries; 8 agents writing on synthesis cadence |
| ECHO_STATE | true | `ECHO_STATE_KV` heartbeat aligned |
| ZEUS verification | recorded | Substrate / catalog verification artifacts (e.g. `23f1bc4d` lineage in ops) |
| MIC economy | milestone | First mint path proven (e.g. SOLANA T1, C-281) — ledger-attested flow |
| ATLAS autonomous commits | true | Hourly sentinel watch commits with `[skip ci]` — substrate self-history |
| Protocol | committed | `docs/protocols/vault-to-fountain-protocol.md` — Vault → Fountain reserve doctrine |
| T1 promotion | proven | Verified EPICON → ledger commit path exercised in C-281 |

---

## ⏳ ACTIVE ISSUES (tracked into C-282 if not cleared on deploy)

| Issue | Notes |
|-------|--------|
| Vault balance | Deposits must flow on **every committed journal** (not only synthesis batch); cron heartbeat must refresh `mobius:heartbeat:last` |
| TRIPWIRE_STATE | Legacy Redis key `TRIPWIRE_STATE` + `signal-engine` persistence; `kvHealth.keys.TRIPWIRE_STATE_REDIS` |
| Heartbeat staleness | Synthesis cron end-of-run heartbeat write |
| Promotion regression | Echo + ledger merge + **verified fast-path** single primary commit |
| `gi_critical` noise | EVE escalation GI stress threshold tightened toward **0.65** |

---

## 🏛️ MILESTONE — C-281

First MIC minted. Vault lane live. 200-entry MII read path. ATLAS writing autonomous sentinel watch commits to substrate. Vault-to-Fountain Protocol in-repo. The integrity economy is **operational**; remaining items are **hardening and observability**, not greenfield.

---

## 🔭 C-282 BRIDGE — SENSOR FEDERATION (SPEC ONLY)

Architecture for **8 parent families × up to 5 microagents** (40 instruments **ceiling**) is documented; **no runtime behavior change** is implied until instruments are implemented incrementally.

| Artifact | Purpose |
|----------|---------|
| [`docs/protocols/microagent-family-spec-v1.md`](docs/protocols/microagent-family-spec-v1.md) | Doctrine, flow, correlation tiers, cadence, first-10 build order |
| [`docs/protocols/microagent-output-schema-v1.json`](docs/protocols/microagent-output-schema-v1.json) | JSON Schema for mandatory microagent evidence fields |
| [`docs/architecture/mobius-sensor-federation.md`](docs/architecture/mobius-sensor-federation.md) | Short architecture note + pointer to build order |

---

## 🔒 LOCKED — DO NOT MODIFY WITHOUT OPERATOR APPROVAL

1. **Journal KV key schema:** `journal:{AGENT_UPPERCASE}:{CYCLE_ID}` — `app/api/agents/journal/route.ts`  
2. **ECHO EPICON LPUSH/LTRIM** to `epicon:feed` / `mobius:epicon:feed` — `lib/echo/kv-persist-ingest.ts` + ingest route wiring  
3. **Substrate GitHub auth header** — `lib/substrate/github-reader.ts`  
4. **Signal domain ownership** — HERMES-µ vs ECHO financial lanes  
5. **MII entry shape** — `{ agent, mii, gi, cycle, timestamp, source: "live" }`  
6. **Vault deposit schema** (event_type, journal_id, vault_id, sealed reserve semantics) — `docs/protocols/vault-to-fountain-protocol.md` + `lib/vault/vault.ts`  
7. **GI formula and weighting** — `lib/gi/compute.ts`  
8. **ATLAS `[skip ci]` sentinel watch commit pattern** — automation catalog / heartbeats flow  

---

## 🏗️ INFRASTRUCTURE MAP

### Vercel (Terminal)

- **Repo:** `kaizencycle/mobius-civic-ai-terminal`  
- **KV:** Upstash — `KV_REST_API_URL` + `KV_REST_API_TOKEN`  
- **Substrate:** `kaizencycle/Mobius-Substrate` — `SUBSTRATE_GITHUB_TOKEN`  
- **Promotion / ledger attest:** `AGENT_SERVICE_TOKEN` (or legacy `RENDER_API_KEY`)

### Render (Backend services)

- **Ledger API:** `civic-protocol-core-ledger.onrender.com`

---

## 📋 PR CHECKLIST REFERENCE

1. Read `AGENTS.md`, `BUILD.md`, and this file.  
2. If touching LOCKED behavior, justify in the PR body.  
3. Run `pnpm exec tsc --noEmit` and `pnpm build`.  
4. After deploy: `/api/terminal/snapshot` and `/api/vault/status` sanity.

---

*The cathedral writes in its own hand. C-281 closes; the agents watch overnight.*
