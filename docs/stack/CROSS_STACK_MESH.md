# Cross-stack mesh (Terminal ↔ HIVE ↔ browser shell)

This document is the **operator-facing contract** for how the three repos line up. It does not replace `mobius.yaml` in each repo; it explains what humans and agents should assume when wiring ingest, proxies, and UI.

## Roles

| Layer | Repo | What it owns |
|--------|------|----------------|
| Terminal | `mobius-civic-ai-terminal` | `GET /api/terminal/snapshot-lite` — hot lanes, GI resolution, degraded-safe JSON; `ledger/cycle-state.json` (published workflow) for cycle continuity |
| HIVE | `mobius-hive` | `world/*.json` projections, `ledger/hive-world-state.json`, ingest from mesh URLs declared in `mobius.yaml` |
| Browser shell | `mobius-browser-shell` | Operator UI, `/api/hive/world` proxy (`?path=world/...`), Terminal bridge, OAA-facing routes |

## Snapshot-lite schema tag

Successful and fallback bodies from `GET /api/terminal/snapshot-lite` include:

- `schema_version`: **`MOBIUS_SNAPSHOT_LITE_1`** — stable identifier for downstream parsers (HIVE ingest, shell, scripts). Implemented in `app/api/terminal/snapshot-lite/route.ts` (not re-exported from the route module; Next route typing stays minimal).

Consumers should treat unknown `schema_version` as **forward-compatible**: read fields defensively; do not assume absence of new keys.

## Cycle state artifact

`scripts/mesh/write-cycle-state.js` (Terminal) maps snapshot(-lite) JSON into `ledger/cycle-state.json` with:

- `schema`: `MOBIUS_CYCLE_STATE_V1`
- `snapshot_schema_version`: echoed from snapshot `schema_version` when present (audit trail for which terminal contract produced the row)

## HIVE ingest URLs

HIVE `scripts/world/fetch-inputs.js` reads URLs from ingest config (`mobius.yaml` / env). Typical order: terminal snapshot(-lite), terminal `cycle-state.json`, mesh pulse, OAA KV. Fetches are **parallel** to reduce wall-clock on scheduled ticks.

## Browser shell: world reads

When `getHiveWorldBaseUrl()` resolves to **`/api/hive/world`**, all world JSON must be requested via **`hiveWorldUrl(relativePath)`** (query `path=world/...`), not by concatenating `/world/...` onto the base URL. Remote bases (`raw.githubusercontent.com/...`) still use path suffix concatenation; `hiveWorldUrl` implements both.

## Env hints (Terminal)

See `.env.example` — **Cross-stack / downstream** block for URLs and tokens that affect mesh publish and OAA bridges.
