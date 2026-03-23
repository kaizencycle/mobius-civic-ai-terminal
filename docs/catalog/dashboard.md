# Mobius Catalog

**Repo:** `kaizencycle/mobius-civic-ai-terminal`
**Generated:** `2026-03-23T17:02:54Z`  
**Cycle:** `C-258`
**Epoch:** `FOUNDATION`

## Terminal health

| Metric | Value | Status |
|--------|-------|--------|
| Global Integrity | 0.78 | yellow |
| MII Baseline | 0.50 | — |
| MIC Supply | 1,000,000 | — |
| Terminal Status | stressed | — |
| Primary Driver | Middle East energy instability | — |

## Codebase

| Metric | Count |
|--------|------:|
| Commits | 107 |
| Files | 189 |
| Lines of code | 14,319 |
| API routes | 25 |
| Components | 10 |
| Hooks | 5 |
| Lib modules | 14 |

## Agent roster

### Canonical (8)

| Agent | Role | Tier |
|-------|------|------|
| ATLAS | Primary Sentinel | Sentinel |
| ZEUS | Secondary Sentinel | Sentinel |
| HERMES | Message Router | Architect |
| AUREA | Civic Architect | Architect |
| JADE | Constitutional Annotator | Architect |
| DAEDALUS | Systems Builder | Steward |
| ECHO | Memory Layer | Steward |
| EVE | Constitutional Eye | Observer |

### Micro sub-agents (4)

| Agent | Domain | Sources |
|-------|--------|---------|
| GAIA | Environment | Open-Meteo, USGS Earthquake |
| HERMES-µ | Information velocity | Hacker News, Wikipedia |
| THEMIS | Governance | Federal Register, data.gov |
| DAEDALUS-µ | Infrastructure | GitHub API, npm, Self-ping |

## Recent PRs (C-256 → C-258)

| PR | Title | Cycle |
|---:|-------|-------|
| #34 | Auto-production deploys + cron micro-agents | C-258 |
| #33 | Tier 1 governance workflows | C-258 |
| #32 | Micro sub-agent scaffold | C-258 |
| #31 | Role permissions and profile UI | C-257 |
| #30 | Mobius Identity spine and profile surface | C-257 |
| #29 | GI-aware Publish to EPICON modal | C-257 |
| #28 | Reactive Global Integrity computation | C-256 |
| #27 | MIC settlement logic for EPICON claims | C-256 |

## API surface (25 routes)

**GI**: `/api/integrity-status`
**Agents**: `/api/agents/status`
**EPICON**: `/api/epicon/{feed,create,verify,publish,candidates}`
**ZEUS**: `/api/zeus/verify`
**ECHO**: `/api/echo/{feed,ingest,snapshot}`
**Ledger**: `/api/ledger/backfill`
**Tripwire**: `/api/tripwire/status`
**Signals**: `/api/signals/{pulse,micro}`
**Runtime**: `/api/runtime/{heartbeat,status}`
**MIC**: `/api/mic/{account,settle}`
**EVE**: `/api/eve/cycle-advance`
**AUREA**: `/api/aurea/oversee`
**Adapters**: `/api/adapters/ingest`
**Identity**: `/api/identity/{me,list}`, `/api/profile`

---

*The catalog is not surveillance. It is legibility: does the system match its published intent?*
