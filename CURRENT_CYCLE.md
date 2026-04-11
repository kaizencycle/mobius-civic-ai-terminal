# CURRENT_CYCLE.md

## Cycle
C-278

## Active focus

Mobius Terminal is moving from monolithic dashboard behavior into true chamber architecture.

Current priority is not adding random features.
Current priority is preserving chamber identity, runtime truth, and clean responsive behavior.

---

## Current strategic direction

### 1. World State chamber
- Mobile default = Map
- Desktop default = Globe
- Shared signal model
- Shared dark/green visual language
- Command console collapsed on mobile

### 2. Route-based chambers
Terminal must remain route-based:

- `/terminal/globe`
- `/terminal/pulse`
- `/terminal/signals`
- `/terminal/sentinel`
- `/terminal/ledger`

Do not regress to single-page tab-state architecture.

### 3. Runtime truth
- lane diagnostics visible
- freshness visible
- degraded states explicit
- no fake values
- partial degradation preferred over full-shell collapse

---

## Immediate priorities

### Priority A
Polish World State chamber:
- desktop globe presence
- mobile map clarity
- inspection behavior appropriate by device
- map/globe share one signal model

### Priority B
Polish Pulse chamber:
- explicit event typing
- cleaner mobile card density
- preserve operator readability

### Priority C
Keep shared shell compact and correct:
- no duplicate chamber chrome
- no buried chamber content
- no giant dashboard wrapper above Globe

---

## Do not break

- route-based chambers
- lane diagnostics
- snapshot health visibility
- freshness indicators
- mobile map / desktop globe split
- collapsed mobile command console
- events / journals / runtime separation
- World State chamber identity

---

## Current product doctrine

### World State
Map is for clarity.
Globe is for presence.

### Mobius
This is not content fill.
This is live integrity keeping.

### UI
Chambers are pages, not widgets.

### System
Reasoning belongs in Substrate.
Facts belong in the Ledger.
The view belongs in the Terminal.
Entry belongs in the Shell.

---

## Current acceptance bar

A good change this cycle should improve at least one of:

- chamber clarity
- runtime truth
- mobile usability
- desktop presence
- signal legibility
- operator trust

A bad change this cycle usually:
- adds surface area without architecture
- hides degraded state
- regresses route-based chambers
- confuses map and globe responsibilities

---

## Current preferred commit style

Examples:
- `fix(world-state): restore globe renderer on desktop`
- `fix(mobile): improve map zoom and bottom-sheet inspection`
- `fix(pulse): map event types explicitly instead of unknown`
- `polish(shell): tighten mobile top chrome and preserve chamber focus`

---

## Final rule for this cycle

Preserve the chamber.
Preserve the truth.
Do not let convenience collapse the architecture.
