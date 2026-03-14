# GitHub Issues — First 6

Reference for creating the initial issue set on `kaizencycle/mobius-civic-ai-terminal`.

---

## Issue 1: Build Terminal Layout

**Labels:** `enhancement`, `v1`

**Goal:** Implement the three-panel terminal structure.

### Tasks

- [x] Agent Cortex panel (left/center)
- [x] EPICON Feed panel (center)
- [x] Detail Inspector panel (right rail)
- [x] Top status bar with cycle, GI, alerts, agent heartbeats
- [x] Footer status bar with service health
- [ ] Responsive collapse behavior for smaller viewports

**Status:** V1 scaffold complete. Refinement and responsive behavior needed.

---

## Issue 2: Implement Civic API Adapter

**Labels:** `enhancement`, `api`, `v1`

**Goal:** Allow the terminal to toggle seamlessly between mock data and live API.

### Tasks

- [x] Snake-to-camel transform layer for all endpoints
- [x] Envelope unwrapping for API responses
- [x] SSE stream client with typed message parsing
- [x] Graceful fallback when API is unavailable
- [ ] Connection status indicator in top bar (STREAM LIVE / RECONNECTING / OFFLINE)

**Status:** Transform layer landed in `944bab9`. Connection status indicator still needed.

---

## Issue 3: Agent Status Visualization

**Labels:** `enhancement`, `ui`, `v1`

**Goal:** Show agent activity visually in the Agent Cortex panel.

### Tasks

- [x] Agent cards with role, status, heartbeat, last action
- [x] Status color mapping (idle, listening, verifying, routing, analyzing, alert)
- [x] Agent color identity (sky for ATLAS, amber for ZEUS, rose for HERMES, etc.)
- [x] Click agent card to open agent profile in Detail Inspector
- [ ] Pulse/glow animation for active agents
- [ ] Click agent card to filter EPICON feed by owner

**Status:** Agent cards fully interactive. Click opens profile in inspector with capabilities.

---

## Issue 4: EPICON Event Cards

**Labels:** `enhancement`, `ui`, `v1`

**Goal:** Create polished UI for EPICON events in the feed.

### Tasks

- [x] Status badge (verified / pending / contradicted) with semantic colors
- [x] Confidence tier display (T0–T4)
- [x] Category tag (geopolitical, market, governance, infrastructure)
- [x] Owner agent tag
- [x] Timestamp
- [x] Click to populate Detail Inspector rail
- [ ] Summary text with truncation for long entries

**Status:** Complete. EPICON cards are clickable and populate the inspector.

---

## Issue 5: Integrity Metric Panel

**Labels:** `enhancement`, `ui`, `v1`

**Goal:** Display the Global Integrity score and its components.

### Tasks

- [x] Large GI score display with delta arrow
- [x] Institutional Trust progress bar
- [x] Information Reliability progress bar
- [x] Consensus Stability progress bar
- [x] Weekly trend sparkline/bar chart
- [x] Click to open GI deep dive in inspector
- [ ] Color transitions based on score thresholds

**Status:** Complete. Clickable GI monitor opens detailed breakdown in inspector.

---

## Issue 6: Tripwire Alerts

**Labels:** `enhancement`, `ui`, `v2`

**Goal:** Display real-time alerts when information divergence occurs.

### Tasks

- [x] Tripwire cards with severity color (low/medium/high)
- [x] Owner agent attribution
- [x] Timestamp and action description
- [x] Alert count in top status bar
- [x] Click tripwire to open analysis in inspector with response protocol
- [ ] Click tripwire to see related EPICON events
- [ ] Sound/visual notification for new high-severity tripwires

**Status:** Tripwire cards are clickable with severity ladder and protocol display in inspector.

---

## Suggested Labels

Create these labels in the repo:

| Label | Color | Description |
|---|---|---|
| `v1` | `#0ea5e9` | V1 terminal milestone |
| `v2` | `#8b5cf6` | V2 live streaming milestone |
| `v3` | `#f59e0b` | V3 civic dashboards milestone |
| `api` | `#10b981` | Backend / API work |
| `ui` | `#f43f5e` | Frontend / UI work |
| `enhancement` | `#a3e635` | New feature |
| `bug` | `#ef4444` | Bug fix |
| `docs` | `#94a3b8` | Documentation |

---

## Suggested Repo Settings

**Description:** A civic Bloomberg-style command terminal for Mobius Substrate — monitoring AI agents, information verification pipelines, and global integrity signals.

**Topics:** `ai`, `civic-ai`, `mobius`, `terminal`, `dashboard`, `integrity`, `governance`, `nextjs`, `fastapi`, `information-verification`

**Website:** `https://mobius-civic-ai-terminal.vercel.app/terminal`
