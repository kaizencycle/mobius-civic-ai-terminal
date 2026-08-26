# EPICON_C-412_CORE_world-terminal-integration_v1

**Cycle:** C-412  
**Scope:** core (Terminal Phase A) + specs (cross-repo contract)  
**Author:** ATLAS  
**Custodian:** Michael Judan  
**Status:** HANDOFF — not implemented

```intent
epicon_id: EPICON_C-412_CORE_world-terminal-integration_v1
ledger_id: kaizencycle
scope: core
mode: normal
issued_at: 2026-08-26T02:34:00Z
expires_at: 2027-08-26T02:34:00Z

justification:
  VALUES INVOKED: Operator truth over illusion; shared protocol state across renderers; Metric Humility (World must not invent GI/MIC/agents).
  REASONING: God's Eye View (world-woad / world.mobius-substrate.com) is live with Cesium globe + tactical HUD. Terminal already exposes MOBIUS_SNAPSHOT_LITE_1, 40 instruments via /api/signals/micro, and integrity surfaces. World and Terminal are disconnected renderers of the same civic stack. Phase A adds a composed read API + CORS for World; Phase B wires World HUD + C-411 observation → EPICON path without duplicating Terminal logic.
  ANCHORS:
    - docs/stack/CROSS_STACK_MESH.md
    - app/api/terminal/snapshot-lite/route.ts
    - app/api/signals/micro/route.ts
    - app/api/integrity-status/route.ts
    - lib/http/handbook-cors.ts
    - docs/epicon/cycles/C-412/HANDOFF_C-412_ATLAS_world-terminal-integration_v1.md
  BOUNDARIES: Does not mutate Reserve Blocks, Track R apply, vault seal repair, or KV key schema. Does not fake runtime values in /api/instruments. WebSocket is optional/deferred on Vercel; polling is the supported v1 transport. Phase B lives in kaizencycle/gods-eye-view — not this repo except CORS + API facade.
  COUNTERFACTUAL: If composed instruments disagree with snapshot-lite GI, facade must surface conflict flags (gi_verified, gi_conflict) rather than smoothing.

counterfactuals:
  - If World origin blocked by CORS, add origin to MOBIUS_HANDBOOK_CORS_ORIGINS before blaming bridge code.
  - If verify path invoked without auth, return 401/403 — never accept unauthenticated packet mutation on production.
  - If /api/instruments latency exceeds SLO, rely on existing KV caches (snapshot-lite, signals/micro) — do not add uncached Render/GIC fan-out.
```

## Summary

Wire **World Renderer** (`kaizencycle/gods-eye-view`) to **Terminal protocol state** (`mobius-civic-ai-terminal`) via a composed HTTP facade. World becomes the citizen observation surface; Terminal remains operator authority. Single source of truth; multiple renderers.

## Repositories

| Phase | Repo | Branch (suggested) |
|-------|------|-------------------|
| A | `mobius-civic-ai-terminal` | `cursor/c412-terminal-instruments-api-0a74` |
| B | `kaizencycle/gods-eye-view` | `mobius/c412-world-terminal-integration` |

## Live deployments (2026-08-26)

| Surface | URL | Role |
|---------|-----|------|
| World (staging) | `https://world-woad.vercel.app` | Cesium globe, Austin default, tactical HUD |
| World (target prod) | `https://world.mobius-substrate.com` | Custom domain — DNS pending |
| Terminal | `https://terminal.mobius-substrate.com` | Protocol authority |

## Non-goals (Phase C+)

- Historical instrument charts, agent detail overlays, HIVE simulation, multi-user collab, persistent world state
- Replacing `/api/terminal/snapshot-lite` for HIVE/mesh consumers
- WebSocket-only transport (polling is v1 default on Vercel serverless)
