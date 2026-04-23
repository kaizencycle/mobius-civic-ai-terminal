# AGENTS.md

## Mobius repo constitution

This repository is part of the **Mobius civic stack**.

Mobius is not a generic app.
It is a civic intelligence system built around:

- **Shell** = citizen entry / bounded action layer
- **Terminal** = operator read / interact surface
- **Substrate** = structured reasoning memory
- **Ledger** = attested fact rail

Do not collapse these layers.
Do not treat them as interchangeable.

---

## Core architectural rules

### 1. Reasoning is not fact
- Reasoning belongs in journals, structured memory, or chamber-specific logic.
- Facts belong in EPICON / ledger-attested flows.
- Do not promote speculative output as settled truth.

### 2. Operator truth over illusion
- Do not fake runtime values.
- Do not hide degraded states behind pretty UI.
- Do not replace missing data with invented data.
- Cached data is allowed only when clearly labeled.

### 3. Chamber identity matters
- Chambers are pages, not buried widgets.
- Globe / World State is the landing chamber.
- Pulse is an operator dashboard chamber.
- Ledger is facts / journals / runtime.
- Signals is analysis / synthesis.
- Sentinel is agent state / diagnostics.

### 4. Mobile and desktop have different priorities
- **Mobile** prioritizes clarity and scanability.
- **Desktop** prioritizes presence and richer operator context.

### 5. Shared data model, different renderers
- World State Map and Globe must use the same normalized signal model.
- Presentation may vary by breakpoint.
- Data meaning must not vary by renderer.

---

## Current UX rules

### World State chamber
- Mobile default = **Map**
- Desktop default = **Globe**
- Both belong to the same World State chamber
- Do not fork chamber logic unnecessarily

### Mobile rules
- Globe/Map must be visible immediately
- Command console should be collapsed by default
- Inspection should be bottom-sheet or mobile-appropriate
- Do not bury the chamber below dashboard chrome

### Desktop rules
- Preserve richer inspection and immersive layout
- Do not regress World State into a flat mobile-only experience

---

## Build and workflow rules

Before claiming success, always run the canonical checks from `BUILD.md`.

At minimum:
1. typecheck
2. build

Do not claim:
- "done"
- "fixed"
- "working"

unless you report:
- files changed
- commands run
- result of each command
- remaining known issues

---

## Change policy

### Preferred
- small, scoped commits
- preserve architecture
- preserve route-based chambers
- preserve provenance and lane health
- preserve partial degradation behavior

### Avoid
- giant multi-feature rewrites
- unrelated dependency churn
- breaking route structure
- silently changing data semantics
- replacing explicit runtime truth with placeholders

---

## Safety / integrity rules

Do not:
- invent GI, MII, MIC, ledger, or runtime values
- remove freshness indicators without replacement
- remove lane diagnostics without replacement
- collapse facts / journals / runtime into one flat surface
- break World State responsive split
- break chamber routing
- hide build failures
- leave partial architecture rewrites undocumented

---

## Terminal-specific rules

### World State
- Keep mobile map and desktop globe aligned in palette and data
- Events and Mobius nodes must remain visually distinct
- Map is for clarity
- Globe is for presence

### Pulse
- Event rows must prefer explicit type mapping over `UNKNOWN`
- Pulse is a dashboard chamber, not the wrapper for all chambers

### Ledger
- Preserve separation between:
  - Events
  - Journals
  - Runtime

### Sentinel
- Preserve agent clarity, status, and diagnostics

### Signals
- Preserve signal freshness and analytical value

---

## Canonical completion report format

When finishing a task, report in this format:

### Changed
- file 1
- file 2
- file 3

### Commands run
- command 1
- command 2

### Result
- typecheck: pass/fail
- build: pass/fail
- lint: pass/fail/not run

### Notes
- remaining issue 1
- remaining issue 2

---

## Final rule

Optimize **operator truth**, not illusion.
Preserve **architecture**, not just appearance.
