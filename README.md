# Mobius Civic AI Terminal

**Civic intelligence. Auditable signals. Integrity in motion.**

A civic Bloomberg-style command terminal for Mobius Substrate — combining agent orchestration, EPICON ledger feeds, integrity monitoring, and auditable consensus into a dense, operator-grade interface.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ MOBIUS TERMINAL                                      C-249 | 07:46 | GI .94 │
│ Alerts 2 | ATLAS OK | ZEUS ACTIVE | ECHO LIVE | HERMES ROUTING | TRIPWIRE N │
├──────────────┬───────────────────────────────────────────────┬───────────────┤
│ LEFT NAV     │ CENTER CANVAS                                 │ RIGHT RAIL    │
│              │                                               │               │
│ Pulse        │ ┌───────────────────────────────────────────┐ │ Event Detail  │
│ Agents       │ │ EPICON FEED                               │ │ Source Stack  │
│ Ledger       │ │ live verified / pending event stream      │ │ Confidence    │
│ Markets      │ └───────────────────────────────────────────┘ │ Agent Trace   │
│ Geopolitics  │                                               │ Notes         │
│ Governance   │ ┌───────────────────────────────────────────┐ │               │
│ Reflections  │ │ AGENT CORTEX                              │ │               │
│ Infra        │ │ ATLAS ZEUS HERMES ECHO AUREA JADE EVE    │ │               │
│ Search       │ └───────────────────────────────────────────┘ │               │
│ Settings     │                                               │               │
│              │ ┌──────────────────────┬────────────────────┐ │               │
│              │ │ GI MONITOR           │ TRIPWIRE WATCH     │ │               │
│              │ │ score, delta, trend  │ anomalies, alerts  │ │               │
│              │ └──────────────────────┴────────────────────┘ │               │
│              │                                               │               │
│              │ ┌───────────────────────────────────────────┐ │               │
│              │ │ COMMAND PALETTE / QUERY BAR               │ │               │
│              │ └───────────────────────────────────────────┘ │               │
├──────────────┴───────────────────────────────────────────────┴───────────────┤
│ Footer: Ledger connected | Lab4 OK | Shield OK | WS Live                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Core Panels

- **EPICON Feed** — structured, auditable event records with confidence tiers
- **Agent Cortex** — live state of ATLAS, ZEUS, HERMES, ECHO, AUREA, JADE, EVE, DAEDALUS
- **GI Monitor** — Global Integrity metric with institutional trust, info reliability, consensus stability
- **Tripwire Watch** — anomaly and divergence monitoring
- **Detail Inspector** — full provenance: source stack, confidence ladder, agent trace
- **Command Palette** — keyboard-first terminal commands

## Setup

### Frontend

```bash
npm install
npm run dev
# Open http://localhost:3000/terminal
```

### Backend (optional)

```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# Docs at http://localhost:8000/docs
```

### Environment

Copy `.env.example` to `.env.local`:

```
NEXT_PUBLIC_MOBIUS_API_BASE=http://localhost:8000/api/v1
```

Without the API, the terminal falls back to mock data automatically.

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/agents/status` | Agent Cortex state |
| `GET /api/v1/epicon/feed` | EPICON event stream |
| `GET /api/v1/integrity/current` | GI snapshot |
| `GET /api/v1/tripwires/active` | Active tripwires |
| `GET /api/v1/system/health` | Service health |
| `GET /api/v1/stream/events` | SSE live updates |

## Tech Stack

**Frontend:** Next.js 15, React 19, Tailwind CSS, TypeScript
**Backend:** FastAPI, Pydantic, SSE (sse-starlette)
**Fonts:** JetBrains Mono + IBM Plex Sans

## Color Language

| Color | Meaning |
|---|---|
| Green | Verified / nominal |
| Amber | Processing / caution |
| Red | Alert / contradicted |
| Sky/Blue | System / ATLAS |
| Rose | Routing / HERMES |
| Fuchsia | Observer / EVE |
| Emerald | Integrity / JADE |

## License

TBD
