# C-412 — ATLAS implementation handoff: World Renderer × Terminal Integration

**Handoff ID:** ATLAS→CURSOR_C-412_world-terminal-integration_v1  
**Cycle:** C-412  
**From:** ATLAS · **To:** Cursor build agent · **Custodian:** Michael (kaizencycle)  
**EPICON:** [EPICON_C-412_CORE_world-terminal-integration_v1.md](./EPICON_C-412_CORE_world-terminal-integration_v1.md)  
**Status:** HANDOFF — Phase A (Terminal) then Phase B (World)  
**Risk:** MEDIUM — new public read facade + cross-origin CORS; no KV schema changes

---

## Executive intent

God's Eye View is **live** (`world-woad.vercel.app`). Terminal is **live** (`terminal.mobius-substrate.com`). They currently show different truths:

- **World** — observable events (earthquakes, flights, fires, …) on a Cesium globe + tactical HUD  
- **Terminal** — 40 integrity instruments, GI/MIC, lanes, agents, governance

This handoff wires them into **one protocol state, two renderers**. World is the citizen interface; Terminal is production authority. **No invented metrics** — World reads composed Terminal APIs only.

---

## Architecture

```
Mobius Protocol State (Terminal authority)
├── Observations        ← World captures (C-411 Phase 2)
├── Integrity (GI/MIC)  ← snapshot-lite, integrity-status
├── Instruments (40)    ← /api/signals/micro
├── Governance          ← snapshot lanes, quorum semantics
└── Evidence            ← EPICON check / echo / journal paths

Terminal Renderer          World Renderer (gods-eye-view)
├── Pulse                  ├── Globe + layers
├── Journal                ├── Tactical HUD
└── Sentinel               ├── Instrument panel (NEW)
                           └── Evidence popup (C-411 → verify adapter)
```

**Pattern:** Same data model as World State Map/Globe split in Terminal — shared normalized model, different presentation.

---

## Existing Terminal surfaces (use these — do not duplicate)

| Endpoint | Schema / role | Use in World |
|----------|---------------|--------------|
| `GET /api/terminal/snapshot-lite` | `MOBIUS_SNAPSHOT_LITE_1` | GI, cycle, lanes, heartbeat, execution_authorized, degraded flags |
| `GET /api/signals/micro` | 40 instruments + agent composites | Instrument grid, alerts, agent health |
| `GET /api/integrity-status` | GI chain, MIC readiness, decision_state | MIC, persistence_state, kv_continuity_ok |
| `GET /api/kv/health` | C-406 continuity semantics | Journal/KV health badge |
| `POST /api/epicon/check` | Consensus on report array | EPICON validation (Pages route) |
| `POST /api/agents/journal` | Attested journal writes | Observation custody (auth required) |

**Not present today (Phase A deliverables):**

- `GET /api/instruments` — composed facade  
- `POST /api/world/verify-observation` — thin adapter (preferred name over generic `verify-packet`)  
- WebSocket `/ws/instruments` — **deferred**; Vercel serverless has no durable WS v1

---

## Phase A — Terminal (`mobius-civic-ai-terminal`)

### A1. Composed instruments API

**New route:** `app/api/instruments/route.ts`  
**Method:** `GET` only (v1)  
**Auth:** Public read (same tier as snapshot-lite)  
**CORS:** Use `handbookCorsHeaders` — extend allowlist (A2)

**Implementation rule:** Compose from existing loaders — **never hardcode** GI, MIC, agent MII, or cycle.

Suggested composition:

```typescript
// Pseudocode — implement with existing lib imports
const [lite, micro, integrity, kvHealth] = await Promise.all([
  fetchSnapshotLiteInternal(),   // or shared lib from snapshot-lite route
  fetchSignalMicroCached(),      // lib/signals path used by /api/signals/micro
  computeIntegrityPayload(),     // lib/integrity/buildStatus
  assessKvKeyHealth(),             // lib/kv/kvKeyHealth
]);

return {
  schema_version: 'MOBIUS_INSTRUMENTS_1',
  timestamp: new Date().toISOString(),
  ok: lite.ok && micro.ok,
  degraded: lite.degraded || integrity.degraded,
  gi: {
    score: lite.gi,
    provenance: lite.gi_provenance,
    verified: lite.gi_verified,
    conflict: lite.gi_conflict,
    floored: lite.gi_floored,
  },
  cycle: {
    id: lite.cycle,               // e.g. "C-414" — never hardcode
    execution_authorized: lite.execution_authorized,
  },
  mic: {
    readiness: integrity.mic_readiness_snapshot_source,
    // expose only fields already public on integrity-status
  },
  instruments: {
    count: micro.instrumentCount,
    errors: micro.errors,
    fallbacks_used: micro.fallbacksUsed,
    failed: micro.failedInstruments,
    items: micro.instruments,     // 40 registry entries
  },
  agents: micro.agentComposites,
  lanes: lite.lanes,
  kv: {
    continuity_ok: kvHealth.kv_continuity_ok,
    diagnostic_ok: kvHealth.kv_diagnostic_ok,
  },
  alerts: deriveAlerts(micro, lite, integrity), // from failed instruments + lane semantic states only
};
```

**Response contract:** `MOBIUS_INSTRUMENTS_1` — versioned like snapshot-lite. Unknown fields forward-compatible.

**Tests:** `tests/contract/worldInstrumentsFacade.test.ts`

- Asserts schema_version present  
- Asserts gi.score matches snapshot-lite when both succeed  
- Asserts instrumentCount === 40 when micro healthy  
- Asserts no synthetic agent roster when micro degraded (empty + degraded flag)

### A2. CORS for World origins

**File:** `lib/http/handbook-cors.ts`

Add to `DEFAULT_ALLOWED` (or document `MOBIUS_HANDBOOK_CORS_ORIGINS` in `.env.example`):

- `https://world.mobius-substrate.com`
- `https://world-woad.vercel.app`

Apply CORS to:

- `GET /api/instruments`
- `GET /api/terminal/snapshot-lite` (already partial — verify World origin passes)
- `OPTIONS` handlers where missing

**POST routes from World** require separate auth design (A3) — do not widen CORS to `*` .

### A3. Observation verify adapter (v1)

**New route:** `app/api/world/verify-observation/route.ts`  
**Method:** `POST`  
**Auth:** `Bearer CRON_SECRET` or `MOBIUS_SERVICE_SECRET` (same as seed-kv / cron family)

**Purpose:** Accept C-411 observation packet from World; return **verdict + instrument delta** without pretending to run full sentinel swarm inline.

**v1 behavior (honest):**

1. Validate packet shape (reuse EPICON / C-411 validators where they exist)  
2. Call `computeConsensus` if reports array present (mirror `/api/epicon/check`)  
3. Return `{ accepted, confidence, witnesses, instruments_snapshot }` where `instruments_snapshot` is fresh `GET /api/instruments` composition  
4. **Do not** invent ZEUS/EVE/HERMES sequential scores — label agent participation only when real journal/verify routes fired

**Future (Phase C):** async queue via echo ingest + sentinel cron; World polls snapshot for confidence evolution.

### A4. Polling contract (replaces WebSocket v1)

Document in `docs/stack/CROSS_STACK_MESH.md`:

| Consumer | URL | Interval |
|----------|-----|----------|
| World HUD | `GET /api/instruments` | 15s prod / 5s dev |
| World fallback | `GET /api/terminal/snapshot-lite` | 30s |

WebSocket `/ws/instruments` is **explicitly out of scope** until durable pub/sub (Render worker, Ably, or Vercel Fluid) is chosen.

### Phase A success criteria

- [ ] `curl -s https://terminal.mobius-substrate.com/api/instruments | jq .schema_version` → `MOBIUS_INSTRUMENTS_1`
- [ ] GI matches snapshot-lite within same request generation
- [ ] 40 instruments when `/api/signals/micro` healthy
- [ ] CORS preflight from `https://world-woad.vercel.app` succeeds
- [ ] `pnpm exec tsc --noEmit` + `pnpm build` pass
- [ ] Contract tests pass
- [ ] **No World repo changes in Phase A PR**

### Phase A commit message

```
feat(terminal): C-412 composed instruments API for World Renderer

- GET /api/instruments (MOBIUS_INSTRUMENTS_1) composes snapshot-lite + micro + integrity
- CORS allowlist for world.mobius-substrate.com + world-woad.vercel.app
- POST /api/world/verify-observation v1 adapter (auth required)
- Contract tests; no invented runtime values
```

---

## Phase B — World (`kaizencycle/gods-eye-view`)

**Branch:** `mobius/c412-world-terminal-integration`  
**Depends on:** Phase A deployed to production Terminal

### B1. Environment

```bash
TERMINAL_API_URL=https://terminal.mobius-substrate.com
INSTRUMENT_PANEL_ENABLED=true
LIVE_UPDATES_ENABLED=true
INSTRUMENT_POLL_MS=15000
```

### B2. Terminal bridge (polling-first)

**Create:** `packages/mobius-integration/terminalBridge.js`

- `initialize()` → `GET ${TERMINAL_API_URL}/api/instruments`  
- `poll()` every `INSTRUMENT_POLL_MS`  
- `verifyObservation(packet)` → `POST ${TERMINAL_API_URL}/api/world/verify-observation` with service token from **server-side proxy** (never expose CRON_SECRET in browser)

**Critical:** Browser cannot hold `CRON_SECRET`. Options:

1. **Vercel serverless proxy** in gods-eye-view (`/api/terminal/verify`) that adds auth server-side  
2. Or Phase B v1: verify adapter disabled in browser; evidence panel shows local C-411 packet only + manual “pending Terminal verify” state

### B3. Instrument HUD

**Create:** `src/hud/instrumentPanel.js` + `instrumentPanel.css`

Render from `MOBIUS_INSTRUMENTS_1`:

| HUD region | Source field |
|------------|--------------|
| GI score | `gi.score` + provenance badge if not live |
| Cycle | `cycle.id` |
| MIC | `mic.*` (hide if null — do not show 0) |
| Sentinels | `agents[]` from micro composites |
| Alerts | `alerts[]` + `instruments.failed[]` |
| KV | `kv.continuity_ok` |
| Evidence queue | defer until verify adapter wired |

**Mobile:** hide panel `<768px` (matches Terminal World State mobile rules — clarity first).

### B4. Click → observation → verify

**Modify:** earthquake (and layer) click handlers

1. `createEpicPacket(entity)` — C-411 Phase 2 (already in World)  
2. Call bridge verify (via server proxy)  
3. `showEvidencePanel({ packet, verdict, instruments })`  
4. HUD refresh on poll / post-verify snapshot

**Degraded:** If Terminal unreachable, show packet + banner `Terminal bridge offline — cached instruments stale`.

### B5. Pre-merge World smoke test

From operator checklist (world-woad):

1. [ ] Globe loads — no Google Maps 403  
2. [ ] Layer toggle (flights, earthquakes) shows live entities  
3. [ ] Event click → popup  
4. [ ] Console: `[World] Terminal bridge connected`  
5. [ ] Instrument panel shows live GI + cycle from Terminal  
6. [ ] Click event → evidence panel (packet at minimum)  
7. [ ] No console errors on steady-state 5 min

### Phase B success criteria

- [ ] HUD reads real Terminal state (GI/cycle match `curl /api/instruments`)  
- [ ] Polling updates without full page reload  
- [ ] Click path generates C-411 packet; verify path hits Terminal when proxy configured  
- [ ] Zero globe regressions (Austin default, tactical HUD preserved)  
- [ ] Deploy preview on `world-woad`; prod DNS optional follow-up

---

## Deployment: `world.mobius-substrate.com`

When Phase B passes preview:

1. Vercel → gods-eye-view project → Domains → add `world.mobius-substrate.com`  
2. Registrar DNS → Vercel records  
3. Add production origin to Terminal CORS allowlist  
4. Re-run Phase A CORS smoke from production World origin

---

## Integrity & safety

| Rule | Enforcement |
|------|-------------|
| No invented GI/MIC/agents | Facade composes live routes only |
| Reasoning ≠ fact | EPICON packets labeled; verify adapter returns consensus status not “truth” |
| Auth on write paths | verify-observation requires service secret |
| Track R stop line | Unaffected — no Reserve Block mutation |
| KV schema | Unchanged |

**Known production stress (2026-08-23):** attested seal `block_number_collisions` may surface in vault/status — World HUD should not hide this if `integrity-status` reports degraded; show operator-visible warning, not green wash.

---

## Testing commands

### Phase A (Terminal)

```bash
# Composed facade
curl -sS "https://terminal.mobius-substrate.com/api/instruments" | jq '{schema:.schema_version, gi:.gi.score, cycle:.cycle.id, n:.instruments.count}'

# CORS preflight
curl -sS -X OPTIONS "https://terminal.mobius-substrate.com/api/instruments" \
  -H "Origin: https://world-woad.vercel.app" \
  -H "Access-Control-Request-Method: GET" -D - -o /dev/null | grep -i access-control

# Parity with snapshot-lite
GI_LITE=$(curl -sS "https://terminal.mobius-substrate.com/api/terminal/snapshot-lite" | jq .gi)
GI_INST=$(curl -sS "https://terminal.mobius-substrate.com/api/instruments" | jq .gi.score)
echo "lite=$GI_LITE inst=$GI_INST"
```

### Phase B (World)

Manual + browser console per B5 checklist. Record screen capture for PR evidence.

---

## PR strategy

| PR | Repo | Title |
|----|------|-------|
| 1 | Terminal | `feat(terminal): C-412 instruments facade + World CORS` |
| 2 | gods-eye-view | `feat(world): C-412 Terminal bridge + instrument HUD` |

Land Phase A first. Phase B PR links to deployed Terminal `/api/instruments` in description.

---

## Rollback

**Terminal:**

```bash
git revert <phase-a-merge-sha>
# Remove world origins from handbook-cors if needed
```

**World:**

```bash
git revert <phase-b-merge-sha>
# Set INSTRUMENT_PANEL_ENABLED=false in Vercel env
```

---

## ATLAS recommendation

1. **Phase A only first** — curl-verify facade + CORS before touching Cesium  
2. **Polling over WebSocket** on Vercel v1  
3. **Server-side verify proxy** — never ship CRON_SECRET to the browser  
4. **Small commits** — facade → CORS → adapter → tests → World bridge → HUD → click wire

**Human approval gate:** Michael  
**Branch ready for:** Cursor implementation

---

*"The map is for clarity; the globe is for presence; the protocol state is for truth." — Mobius C-412*
