# Mobius Terminal Hybrid Redesign (Superneon × Quantara)

## Positioning

**Verdict:**
- yes to Superneon-inspired styling for the public-facing Mobius shell
- no to a 1:1 template copy inside mission-critical terminal panes
- best result is a hybrid: **premium sci-fi shell + disciplined civic operator console**

**One-line guidance:**
> Superneon outside, disciplined civic console inside.

---

## Why this hybrid fits Mobius

Superneon maps well to:
- civic AI identity
- high-contrast, command-center brand perception
- premium shell and live-state framing

Quantara maps well to:
- clean modular structure
- dense information readability
- product/data hierarchy for operational workflows

Together they support Mobius priorities:
- first-impression strength
- scan speed and trust
- calm, legible operator lanes

---

## Ratio and usage model

### Recommended ratio
- **30% Superneon**
- **70% Quantara**

### Formula
- **Superneon for mood**
- **Quantara for discipline**

### Practical split
1. **Shell / chrome:** 70% Superneon, 30% Quantara
2. **Main data surfaces:** 25% Superneon, 75% Quantara
3. **Motion language:** Superneon style, Quantara restraint

---

## Component mapping

### Use more Superneon in
- top nav
- hero/status ribbon
- chamber tabs and active chamber glow
- live-state indicators and subtle edge lighting

### Use more Quantara in
- cards, tables, and data grids
- ledger / events / journal lanes
- agent roster and detail inspector
- tripwire panels and command surfaces

---

## Guardrails (non-negotiable)

- reduce background spectacle in working panes
- reduce animation frequency in dense operator workflows
- do not rely on glow as sole state indicator
- keep strong contrast and keyboard focus clarity
- prioritize legibility for Events, Journal, Tripwires, and agent reasoning

---

## GitHub-ready PR draft

### Title
`feat(terminal-ui): hybridize Superneon shell with Quantara data layout`

### Branch
`cursor/c272-terminal-hybrid-shell`

### Body

```md
## Summary

This PR redesigns the Mobius Civic Terminal UI using a hybrid visual system:

- **Superneon** for mood, shell, glow language, and premium sci-fi identity
- **Quantara** for layout discipline, modular data surfaces, and readable AI/product structure

The goal is **not** to turn the terminal into a marketing page.

The goal is to make Mobius feel:
- more premium
- more futuristic
- more legible
- more trustworthy as a live civic operator console

## Design direction

### Superneon contributes
- neon-glow identity
- cosmic/dark premium shell
- cinematic motion language
- high-contrast dashboard energy

### Quantara contributes
- clean AI-first layouts
- modular structure
- product-centric clarity
- smoother, more restrained motion
- stronger content hierarchy

## Hybrid rule

**Superneon for shell. Quantara for discipline.**

That means:
- top nav, chamber chrome, hero status, active states = Superneon-inspired
- cards, ledger panes, tables, roster blocks, data grids = Quantara-inspired

## Why

The current terminal already has live substrate surfaces:
- GI / tripwires / agents / signals / ledger
- chamber structure
- agent roster and live signal trace
- a real command-center foundation

But the current visual language still feels closer to an internal prototype than a fully realized civic operating system.

This PR improves:
- first impression
- scan speed
- chamber hierarchy
- active-state clarity
- premium feel without sacrificing operator trust

## Scope

### Included

#### 1. Terminal shell refresh
- redesign top chrome using a darker premium shell
- add subtle neon edge-lighting to active areas
- improve chamber tab and active-nav styling
- tighten status ribbon hierarchy for:
  - cycle
  - GI
  - live state
  - alerts
  - tripwire posture

#### 2. KPI strip redesign
- rework GI / Signal Feed / Tripwires / Agents Live cards
- cleaner spacing
- higher readability
- restrained accent glow only on high-priority metrics

#### 3. Ledger + data-surface cleanup
- shift ledger/event/journal panes toward a flatter, more structured layout
- reduce ornamental glow inside dense work surfaces
- improve row spacing, chip styling, and scan hierarchy
- make tables/cards feel more “operator console” and less “landing page”

#### 4. Chamber card system
- create a shared card language for:
  - command surface
  - tripwire anomalies
  - agent roster
  - signal feed
  - journal/event lanes
- use Quantara-style modularity with restrained Superneon accents

#### 5. Motion and interaction polish
- keep motion subtle and purposeful
- use glow + motion for:
  - active chamber
  - hover/focus states
  - live metric transitions
  - panel reveals
- avoid cinematic motion inside dense reasoning panes

#### 6. EVE / governance visual lane readiness
- introduce visual affordances for governance / ethics / civic-risk entries
- ensure EVE-authored rows can feel distinct from ZEUS / HERMES / ATLAS / AUREA
- maintain compatibility with existing ledger/event feed structure

## Visual system rules

### Use more Superneon in:
- header
- nav
- live state indicators
- selected chamber
- hero/status shell
- active metric emphasis

### Use more Quantara in:
- ledger
- event rows
- journal
- agent roster
- tripwire panels
- command surface
- detail inspector
- data cards

## Implementation notes

### Styling
- keep dark base
- use thin luminous accents instead of heavy glow floods
- preserve strong contrast for serious operator workflows
- avoid decorative gradients behind dense text surfaces

### Motion
- use restrained transitions
- reduce background spectacle in working panes
- preserve performance and readability over visual drama

### Accessibility
- maintain high text contrast
- do not use glow as the only state indicator
- support keyboard focus clearly
- preserve scanability for tables and anomaly lists

## Non-goals

This PR does **not**:
- redesign the ingest architecture
- change agent routing logic
- rewrite the terminal data model
- turn the terminal into a pure marketing shell
- add excessive animation or visual noise

## Acceptance criteria

- terminal feels visually premium without harming legibility
- chamber navigation is easier to scan
- KPI row has clearer hierarchy
- ledger and journal panes are more readable
- active states are more obvious
- the shell feels distinctly “Mobius”
- data-heavy panes remain calm and trustworthy

## QA checklist

- [ ] Header/chamber shell updated
- [ ] KPI cards redesigned
- [ ] Ledger/event/journal surfaces cleaned up
- [ ] Agent roster restyled
- [ ] Tripwire anomalies panel updated
- [ ] Active chamber glow added
- [ ] Hover/focus states improved
- [ ] Motion restrained in dense panes
- [ ] Mobile layout still readable
- [ ] Desktop layout feels less prototype-heavy
- [ ] No regression in command surface readability
- [ ] No regression in dark-mode contrast

## Notes for review

This PR intentionally avoids copying either template 1:1.

It uses:
- **Superneon** as visual inspiration for premium shell, glow language, and dashboard energy
- **Quantara** as visual inspiration for modular structure, clean layouts, and product/data clarity

Target result:
**a premium sci-fi shell wrapped around a disciplined civic operator dashboard**
```

---

## Optional follow-up PR sequence

1. `feat(terminal-ui): shell and card system implementation`
2. `feat(terminal-ui): ledger and journal readability pass`
3. `feat(terminal-ui): chamber motion and active-state polish`
4. `feat(terminal-ui): eve governance lane styling`
5. `feat(terminal-ui): mobile terminal density cleanup`

---

## Source references

- Superneon template: https://webflow.com/templates/html/superneon-website-template
- Quantara template: https://webflow.com/templates/html/quantara-website-template
