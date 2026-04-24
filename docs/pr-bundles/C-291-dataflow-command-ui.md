# C-291 — Dataflow Command UI

## Purpose

Give the Terminal a flow-control command layer so operators can see data circulation before raw content.

The C-291 diagnosis is that Mobius has enough data. The bottleneck is routing, filtering, normalization, freshness, and UI hydration.

Core principle:

> The Terminal should show circulation before content.

---

## Problem

Mobius receives live data from many lanes:

- KV
- Backup Redis
- Snapshot
- Snapshot-lite
- EPICON
- Ledger API
- Agent Journals
- Cron sweeps
- Vault
- MII
- Globe / sentiment lanes
- GitHub merge events
- Substrate canon writes

Without a dataflow command layer, the UI can look like it is failing even when data is flowing. The problem becomes visual traffic control, not data scarcity.

---

## UI Change

Add a Dataflow Command Spine to the Terminal shell.

Pipeline:

```txt
Sources → Intake → Normalize → Verify → Ledger → UI
```

Agent mapping:

```txt
Sources   = HERMES
Intake    = ECHO
Normalize = HERMES
Verify    = ZEUS
Ledger    = JADE
UI        = ATLAS
```

Each stage displays:

- stage label
- responsible agent
- state badge
- small detail / count / freshness

---

## Runtime Behavior

The Dataflow Command Spine consumes already-existing shell and lane diagnostics data:

- `useShellSnapshot()`
- `useLaneDiagnosticsChamber()`

No new backend route is required in this PR.

The panel uses existing chamber hydration and respects the current low-frequency lane diagnostics polling model.

---

## Files Changed

- `components/terminal/DataflowCommandSpine.tsx`
- `components/terminal/TerminalShell.tsx`

---

## Design Rules

1. Show data circulation before raw content.
2. Keep the panel compact enough for the main shell.
3. Use existing data lanes; do not add extra backend load.
4. Show freshness and fallback state.
5. Make HERMES / ECHO / ZEUS / JADE / ATLAS duties visible.
6. Keep deeper lane diagnostics behind the existing `Lane diag` toggle.

---

## Acceptance Criteria

- [x] Add Dataflow Command Spine component.
- [x] Mount spine in Terminal shell.
- [x] Add Flow toggle near Lane Diagnostics.
- [x] Use existing shell snapshot and lane diagnostics hooks.
- [x] Avoid creating new backend endpoints.
- [x] Show stage state badges.
- [x] Show cycle, freshness, and packet mode.
- [x] Preserve Lane Diagnostics as the deeper drilldown.

---

## Follow-Ups

- [ ] Add chamber packet summary cards.
- [ ] Add backlog counters: canon pending, verification queue, duplicate skips.
- [ ] Add public/operator UI split.
- [ ] Add virtualized Journal / Ledger long lists.
- [ ] Add drilldown drawer for raw event provenance.
- [ ] Add HERMES Dataflow Governor endpoint once packet schemas are stable.

---

## Canon

Mobius does not need to drink from the firehose.

Each chamber receives a packet.
Each packet carries freshness.
Each agent has a duty.
Each lane has a pulse.

We heal as we walk.
