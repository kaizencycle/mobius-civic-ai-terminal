# CURRENT_CYCLE.md — C-280
> **Last verified:** 2026-04-13T12:25Z by ATLAS (kaizencycle)
> **Snapshot commit:** `74fc1493` — C-280 in sync (agent work may advance this SHA after merge)
> **Production URL:** https://mobius-civic-ai-terminal.vercel.app
> **Vercel project:** `prj_ru2eaIzY0nIamFIXEdUIuTjnefpn` · team `team_cEncfJHYpxuB6YiFQNwdOUB5`

---

## ⚠️ READ THIS FIRST — FOR ALL AGENTS (Cursor, Codex, Claude Code)

This file is the **ground truth** for the current state of the Terminal repo.
Before making any change, read this file in full.
If your task conflicts with a LOCKED entry, **stop and ask the operator**.
If your task describes fixing something in the EXPECTED EMPTY section, **do not proceed** — it is not a bug.

---

## ✅ LANE STATUS (as of last snapshot @ 12:25Z)

| Lane | State | Note |
|------|-------|------|
| snapshot | healthy | `ok: true`, `cycle: "C-280"` at root |
| integrity | degraded/live | GI ~0.73, source **kv** ✅, mode yellow |
| signals | healthy | All four micro-agents live |
| kvHealth | healthy | ~354ms latency |
| agents | healthy | All eight active; heartbeat fresh |
| journal | healthy | `sources.kv: 1` ✅ — first KV journal write (EVE) |
| mii | healthy | `mii:feed` — nine entries; EVE hourly; ATLAS/ZEUS MII after cron once deployed |
| echo | healthy | Nine C-280 EPICONs; `duplicateSuppressedCount: 0` ✅ |
| sentiment | healthy | Six domains; CIVIC / INSTITUTIONAL ~0.965 |
| epicon | empty | `kv: 0` on feed list — bridge alignment + stale feed persistence in progress (C-280) |
| runtime | healthy | Freshness nominal |
| promotion | silent | Eligible items found; zero commits — token / commit path (C-280) |
| eve | healthy | Cycle synthesis cron + POST |

---

## 🔒 LOCKED — DO NOT MODIFY WITHOUT OPERATOR APPROVAL

These behaviors are confirmed working. Any PR that touches these files **must**
explicitly state in the PR description why the change is safe.
If you are unsure, **stop**.

### 1. Journal KV key schema
- **File:** `app/api/agents/journal/route.ts`
- **What:** Route reads keys matching `journal:{AGENT}:{CYCLE}` (three segments, uppercase agent, e.g. `journal:EVE:C-280`)
- **Why locked:** Agents write to this exact schema. Changing the reader breaks the entire journal lane.
- **DO NOT:** Change to `journal:all`, `journal:eve`, or any two-segment schema.

### 2. ECHO → `epicon:feed` KV bridge
- **File:** `app/api/echo/ingest/route.ts` (shared helper `lib/echo/kv-persist-ingest.ts`)
- **What:** After ECHO rates EPICONs, LPUSH completed entries into `epicon:feed` and LTRIM to 100
- **Why locked:** Primary path for live KV EPICONs to reach the terminal feed.
- **DO NOT:** Remove the LPUSH/LTRIM step. Do not move it after an error boundary that could skip it.

### 3. Substrate GitHub auth header
- **File:** `lib/substrate/github-reader.ts`
- **What:** GitHub API calls to `kaizencycle/Mobius-Substrate` include `Authorization: Bearer ${SUBSTRATE_GITHUB_TOKEN}`
- **DO NOT:** Remove the Authorization header.

### 4. HERMES signal domain assignment
- **File:** `app/api/signals/micro/route.ts` (HERMES-µ section)
- **DO NOT:** Add CoinGecko or other crypto price sources to HERMES-µ (ECHO owns financial).

### 5. Multi-agent journal aggregation
- **File:** `app/api/agents/journal/route.ts`
- **DO NOT:** Replace `kv.keys('journal:*')` with a hardcoded agent list.

### 6. MII entry shape
- **Shape:** `{ agent, mii, gi, cycle, timestamp, source: "live" }`
- **DO NOT:** Change field names or `source` semantics without operator approval.

### 7. GI formula and weighting
- **File:** `lib/gi/compute.ts`
- **DO NOT:** Change weights or inputs without operator approval.

---

## ⏳ EXPECTED EMPTY — NOT A BUG, DO NOT FIX

_Use only when the operator has confirmed the state is intentional._

---

## 🔧 ACTIVE WORK — C-280

- [ ] **ECHO_STATE** KV key-exists in `/api/kv/health` — `echo:kv:heartbeat` + legacy diagnostics (Opt 2)
- [ ] **TRIPWIRE_STATE** — aligned KV heartbeat key for health (Opt 2)
- [ ] **epicon:feed** `kv: 0` — persist on stale `/api/echo/feed` re-ingest + LPUSH logging (Opt 5)
- [ ] **promotion** — require `AGENT_SERVICE_TOKEN` / `RENDER_API_KEY` before commit; explicit logs (Opt 3)
- [ ] **ATLAS / ZEUS** overnight journals — `/api/agents/atlas/observe`, `/api/agents/zeus/verify` after EVE cron (Opt 1)
- [ ] **MII all agents** — ATLAS/ZEUS MII on sentinel routes; echo batch unchanged (Opt 4)
- [ ] **GI freshness** — `/api/cron/gi-refresh` every 30 minutes (Opt 6)

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

1. Did I read `AGENTS.md`, `BUILD.md`, and this file before starting?
2. Does this PR touch any LOCKED file/behavior? If yes, state why safe.
3. Did `pnpm build` pass?
4. Did I check `/api/terminal/snapshot` after deploy?

---

*This file must be updated whenever a lane changes state, a lock is added or removed, or a cycle advances. Operator: kaizencycle. Agent: ATLAS.*
