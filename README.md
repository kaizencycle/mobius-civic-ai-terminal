# Mobius Civic AI Terminal

**A civic AI command terminal for the Mobius Substrate.**

The Mobius Civic AI Terminal provides a real-time operational interface for monitoring AI agents, verifying information flows, and tracking integrity signals across a civic AI network.

Think of it as a **Bloomberg Terminal for truth verification and civic intelligence.**

Instead of financial tickers, the terminal monitors:
- AI agents and sentinel council status
- EPICON information events
- verification pipelines and confidence tiers
- global integrity signals (GI / MII)
- tripwire alerts and civic radar threats
- immutable ledger entries and MFS shards

![Mobius Architecture](docs/architecture.svg)

---

## Why This Exists

Modern information systems optimize for speed and amplification, not verification and integrity.

The Mobius Civic AI Terminal is designed to make information **auditable, traceable, and verifiable** before it spreads.

It is part of the broader Mobius ecosystem:

| Repo | Role |
|---|---|
| [**Mobius-Substrate**](https://github.com/kaizencycle/Mobius-Substrate) | Core infrastructure — EPICON schema, MII scoring, MFS shards, Sentinel Council, civic ledger API |
| [**mobius-browser-shell**](https://github.com/kaizencycle/mobius-browser-shell) | Browser interface — citizen auth, learning labs, civic radar, knowledge graph |
| **mobius-civic-ai-terminal** *(this repo)* | Operator terminal — real-time monitoring, command palette, integrity dashboard |

Together they form an experimental civic AI infrastructure designed to:
- reduce misinformation amplification
- create transparent verification pipelines
- allow humans and AI agents to collaboratively audit information
- provide integrity metrics for information ecosystems

---

## Core Concepts

### EPICON Feed

EPICON events are structured information events moving through the Mobius verification pipeline. Each event contains a source chain, verification owner, confidence tier, and a trace of which agents handled it.

Example lifecycle:

```
ECHO detects signal → HERMES routes signal → ZEUS verifies sources → ATLAS updates integrity context → AUREA synthesizes outcome
```

### Mobius Agents

The terminal visualizes the current state of eight Mobius agents:

| Agent | Role |
|---|---|
| **ATLAS** | Monitoring and anomaly detection |
| **ZEUS** | Verification engine |
| **HERMES** | Information routing |
| **ECHO** | Ledger recording |
| **AUREA** | Strategic synthesis |
| **JADE** | Annotation and morale layer |
| **EVE** | Ethics observer |
| **DAEDALUS** | Research and build system |

### Integrity Metrics

The system tracks a **Global Integrity Score (GI)** that measures information health across source reliability, institutional trust, consensus stability, and narrative divergence. The goal is not to suppress information but to expose reliability levels transparently.

### Mobius Integrity Credits (MIC)

**MIC** is an integrity-linked credit: **spendable or wallet-visible MIC is not the same thing as Vault reserve units.** Journals accrue **reserve** toward sealed tranches; **Fountain** release stays **GI- and sustain-gated** (see Vault chamber and `/api/vault/status`). Broader economics or cathedral-scale tokenomics for MIC may live in **Mobius-Substrate**; the **runtime-canonical** description for this stack is:

- [`docs/protocols/mic/mic_issuance_protocol.md`](docs/protocols/mic/mic_issuance_protocol.md) — issuance layers and mint vs reserve  
- [`docs/protocols/mic/mic_runtime_reference.md`](docs/protocols/mic/mic_runtime_reference.md) — routes and libraries in **this** repo

### Ecosystem Integration

**From [Mobius-Substrate](https://github.com/kaizencycle/Mobius-Substrate):**
- **Civic Ledger** — Immutable record of all EPICON events, attestations, MFS shards, UBI distributions, and settlements
- **Sentinel Council** — 10 AI sentinels across multiple providers (Anthropic, OpenAI, Google, Meta) with 3-of-10 quorum consensus
- **MFS (Mobius Fractal Shards)** — Atomic integrity units with archetype classification, quality scoring, and MII delta tracking
- **Attestations** — Mint/burn integrity credits validated by sentinel agents

**From [mobius-browser-shell](https://github.com/kaizencycle/mobius-browser-shell):**
- **Civic Radar** — Real-time threat intelligence feed monitoring misinformation, privacy violations, manipulation, and infrastructure alerts
- **ECHO Threat Intelligence** — Agent-generated threat entries with IOCs, CVEs, and RAG sources
- **Citizen Shield** — Digital safety alerts and privacy boundary monitoring

---

## Terminal Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ MOBIUS TERMINAL                           C-XXX (runtime cycle) | ET | GI .94 │
│ Alerts 2 | ATLAS OK | ZEUS ACTIVE | ECHO LIVE | HERMES ROUTING | TRIPWIRE N │
├──────────────┬───────────────────────────────────────────────┬───────────────┤
│              │                                               │               │
│  SIDEBAR     │  COMMAND CANVAS                               │  INSPECTOR    │
│              │                                               │               │
│  Pulse       │  ┌─────────────────────────────────────────┐  │  Event Detail │
│  Agents      │  │ EPICON FEED                             │  │  Source Stack │
│  Ledger      │  │ live verified / pending event stream    │  │  Confidence   │
│  Markets     │  └─────────────────────────────────────────┘  │  Agent Trace  │
│  Geopolitics │                                               │  Notes        │
│  Governance  │  ┌─────────────────────────────────────────┐  │               │
│  Reflections │  │ AGENT CORTEX                            │  │               │
│  Infra       │  │ ATLAS ZEUS HERMES ECHO AUREA JADE EVE  │  │               │
│  Search      │  └─────────────────────────────────────────┘  │               │
│              │                                               │               │
│              │  ┌────────────────┬────────────────────────┐  │               │
│              │  │ GI MONITOR     │ TRIPWIRE WATCH         │  │               │
│              │  └────────────────┴────────────────────────┘  │               │
│              │                                               │               │
│              │  ┌─────────────────────────────────────────┐  │               │
│              │  │ COMMAND PALETTE                         │  │               │
│              │  └─────────────────────────────────────────┘  │               │
├──────────────┴───────────────────────────────────────────────┴───────────────┤
│ Ledger Connected · Lab4 OK · Shield OK · Stream Live                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Left Panel — Sidebar.** Chamber navigation across Pulse, Agents, Ledger, Markets, Geopolitics, Governance, Reflections, Infrastructure, and Search.

**Center Panel — Command Canvas.** EPICON event feed, Agent Cortex visualization, GI Monitor, Tripwire Watch, and keyboard-first Command Palette.

**Right Panel — Detail Inspector.** Full provenance for any selected event: source stack, confidence ladder, agent trace, and operator notes. Answers the question: *"Why does Mobius believe this?"*

---

## Architecture

```
┌─────────────────────────────────┐
│       INTERNET / SIGNALS        │
│   news · feeds · observations   │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│        MOBIUS AGENTS            │
│  ECHO → HERMES → ZEUS → ATLAS  │
│  detect   route   verify  scan  │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│    VERIFICATION PIPELINE        │
│  confidence tiers · consensus   │
│  source chains · tripwires      │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│     INTEGRITY SCORE (GI)        │
│  trust · reliability · stability│
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│   MOBIUS CIVIC AI TERMINAL      │
│  operator view · audit trail    │
│  command palette · civic map    │
└─────────────────────────────────┘
```

### Tech Stack

| Layer | Stack |
|---|---|
| **Frontend** | Next.js 15, React 19, Tailwind CSS, TypeScript |
| **Backend** | FastAPI, Pydantic, SSE event streaming |
| **Fonts** | JetBrains Mono (data) + IBM Plex Sans (interface) |
| **Infra** | Vercel (frontend) + Render (API) |

### Color Language

| Color | Meaning | Agent |
|---|---|---|
| Sky / Blue | System | ATLAS |
| Amber | Verification / caution | ZEUS |
| Rose | Routing / pressure | HERMES |
| Slate | Memory / archive | ECHO |
| Orange | Strategy / synthesis | AUREA |
| Emerald | Integrity / nominal | JADE |
| Fuchsia | Observer / governance | EVE |
| Yellow | Research / build | DAEDALUS |
| Red | Alert / contradicted | — |

---

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/agents/status` | Agent Cortex state |
| `GET /api/v1/epicon/feed` | EPICON event stream |
| `GET /api/v1/integrity/current` | GI snapshot |
| `GET /api/v1/tripwires/active` | Active tripwires |
| `GET /api/v1/system/health` | Service health |
| `GET /api/v1/stream/events` | SSE live updates |

Without a configured API, the terminal falls back to mock data automatically.

## Integrity Signal Ingestion Layer

To support broader Mobius ecosystem ingestion, the terminal now includes a normalized ingestion stack:

- `lib/ingestion/MobiusDataClient.ts` — registers terminal and substrate data sources, connects via SSE/polling, and emits standardized integrity signals through an in-app signal bus.
- `lib/ingestion/processors/EPICONProcessor.ts` — maps EPICON events into confidence tiers, provenance status, threat indicators, sentiment metadata, and GI deltas.
- `lib/ingestion/processors/AgentProcessor.ts` — computes agent health, constitutional compliance, activity velocity, and integrity contribution.
- `hooks/useIntegritySignals.ts` — React hook for subscribing to all processed signals, retrieving filtered subsets, and computing an aggregated GI trend.

This ingestion layer is additive and can be used by new dashboard modules without replacing existing `useTerminalData` flows.

### Ingestion Environment Variables

```bash
# Terminal API (primary)
NEXT_PUBLIC_TERMINAL_API_BASE=http://localhost:8000/api/v1

# Mobius-Substrate Services
NEXT_PUBLIC_LEDGER_URL=http://localhost:3000
NEXT_PUBLIC_GI_URL=http://localhost:3001
NEXT_PUBLIC_MIC_URL=http://localhost:4002
NEXT_PUBLIC_BROKER_URL=http://localhost:4005
NEXT_PUBLIC_OAA_URL=http://localhost:3004

# Ingestion Settings
NEXT_PUBLIC_SSE_RECONNECT_MS=5000
NEXT_PUBLIC_POLL_INTERVAL_MS=30000
NEXT_PUBLIC_MAX_SIGNAL_HISTORY=1000
```

---

## Boot Modes

Mobius should not be understood as a single boot path.

The terminal is the entry surface, but the full Mobius stack can be mounted at different depths depending on the operator.

### Visitor
Open the deployed terminal in the browser.

```bash
open https://mobius-civic-ai-terminal.vercel.app/terminal
```

Best for:
- first-time users
- public observers
- read-only exploration

### Operator
Use the terminal as a working command surface connected to hosted APIs and hosted inference.

```bash
npx mobius-terminal
```

Best for:
- daily terminal usage
- civic operators
- high-context contributors

### Builder
Run the repo locally for development, testing, and hybrid integration work.

```bash
npm install
npm run dev
```

Best for:
- contributors
- local testing
- terminal and API iteration

### Sovereign
Run Mobius as private or self-hosted infrastructure.

```bash
mobius up --profile sovereign
```

This mode is the long-term full-node / private-stack direction.

For the canonical boot matrix, see [docs/BOOT_PROFILES.md](docs/BOOT_PROFILES.md).

---

## Local Development

The current repo-local development flow is closest to **Builder Mode**.

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

Create `.env.local` from `.env.example`:

```
NEXT_PUBLIC_MOBIUS_API_BASE=http://localhost:8000/api/v1
```

---

## Command Palette

The terminal includes a keyboard-first command interface:

| Command | Action |
|---|---|
| `/help` | List all available commands |
| `/scan [term]` | Search across events, agents, tripwires |
| `/agents [name]` | Show agents or inspect a specific one |
| `/tripwires [id]` | Show tripwires or inspect one |
| `/gi` | Open governance integrity view |
| `/pulse` | Switch to Pulse chamber |
| `/markets` | Switch to Markets chamber |
| `/ledger` | Switch to Ledger chamber |
| `/geo` | Switch to Geopolitics chamber |
| `/governance` | Switch to Governance chamber |
| `/settings` | Switch to Settings chamber |

---

## Roadmap

**V1** — Terminal layout, mock civic API, EPICON event feed, agent visualization, interactive panels *(current)*

**V2** — Live event streaming, Mobius agent orchestration, tripwire alert engine

**V3** — Civic dashboards, verification consensus voting, public integrity explorer

---

## Project Status

Experimental civic infrastructure project. The Mobius Civic AI Terminal is a prototype interface exploring how AI systems and humans might collaboratively monitor information integrity.

The runtime cycle is derived from the terminal's deterministic cycle engine rather than from static documentation examples.

**Live deployment:** [mobius-civic-ai-terminal.vercel.app/terminal](https://mobius-civic-ai-terminal.vercel.app/terminal)

---

## License

MIT
