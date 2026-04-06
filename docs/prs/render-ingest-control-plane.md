# PR Title

Promote Render backend as terminal ingest control plane and harden live bootstrap paths

## PR Body

## Summary

Use the Mobius Render backend as the primary ingest control plane for terminal live data surfaces.

This PR intentionally builds on existing live substrate instead of replacing it:

- multi-source `/api/epicon/feed`
- Redis-backed EPICON feed lanes
- live promotion pipeline in `/api/epicon/promote`
- Redis-backed journal lane in `/api/agents/journal`
- chambered terminal client surfaces (Pulse / Ledger / Agents / Infrastructure / Wallet / Sentiment)

## What is already live

### Feed and ledger
`/api/epicon/feed` already merges:
- Render ledger API entries
- KV feed entries (`mobius:epicon:feed`, `epicon:feed`)
- EVE synthesis Redis entries
- local memory ledger
- GitHub commit-derived feed events
- memory-feed rows

### Promotion
`/api/epicon/promote` already:
- reads pending EPICON intake
- routes by category to agent lanes
- writes committed `agent_commit` rows
- appends journal-lane entries after commit

### Journal
`/api/agents/journal` already exists as a separate Redis-backed reasoning lane:
- aggregate lane: `journal:all`
- per-agent lanes: `journal:<agent>`
- POST writes require service auth

## Problem

The substrate is live, but ingest behavior is still fragmented in key paths:

- public terminal bootstrap falls to resilient shell too easily
- some adapters use internal `/api/...` routes while others jump directly to mocks
- promotion status checks and promotion triggers are too tightly coupled
- events and journal truth lanes are not always clearly represented
- Render ingest is not yet enforced as the authoritative ingress spine

## Goal

Establish a cleaner ingest architecture:

- normalize incoming signals into a single ingest envelope
- keep pending intake separate from committed ledger memory
- keep promotion side effects explicit and safe
- improve server-first bootstrap reliability
- clarify Events vs Journal truth in the UI

## Proposed changes

1. **Server bootstrap snapshot for `/terminal`**
   - fetch initial terminal snapshot on the server
   - inject initial state into client hydration
   - reduce first-paint degraded shell states

2. **Separate promotion status from promotion execution**
   - add side-effect-free status route
   - keep promotion execution behind explicit POST
   - avoid browser polling against trigger-like endpoints

3. **Normalize adapter fallback contract**
   - align agents, tripwires, EPICON, integrity, and related panels to one live/degraded/mock contract
   - prefer internal `/api/...` routes before mock fallback

4. **Treat Render ledger ingest as authoritative input**
   - standardize ingest envelope fields across sources
   - preserve source labels (`ledger-api`, `agent_commit`, `eve-synthesis`, etc.)
   - dedupe prior to promotion where feasible

5. **Improve ledger chamber truthfulness**
   - explicitly separate **Events** and **Journal** views
   - default to Events when committed agent rows exist
   - surface counts for committed event rows, journal rows, and pending promotable rows

## Non-goals

This PR does **not**:
- replace the existing EPICON pipeline
- remove Redis-backed lanes
- redesign all terminal chambers
- rewrite agent routing logic from scratch

## Validation

- `/terminal` renders server-bootstrapped live data on first load
- promotion status polling has no write side effects
- adapters no longer fall to mocks when internal routes are healthy
- EPICON feed still contains committed rows from live sources
- journal lane still receives writes after promotion
- Ledger chamber clearly reflects Events vs Journal truth

## Why this matters

The live substrate already exists. This PR aligns it into a coherent ingest flow:

**Render/backend ingest → pending intake → promotion → committed memory → terminal read model**

This reduces false degraded states and makes terminal behavior match live system truth more reliably.

## Checklist

- [ ] Add server bootstrap snapshot plumbing for `/terminal`
- [ ] Add side-effect-free promotion status endpoint
- [ ] Keep promotion execution on explicit POST only
- [ ] Unify client adapter fallback contract (live → degraded → mock)
- [ ] Standardize ingest envelope fields across feed sources
- [ ] Apply pre-promotion dedupe where possible
- [ ] Expose committed/journal/pending counts in Ledger chamber
- [ ] Verify journal writes continue post-promotion
- [ ] Validate first-load experience avoids resilient-shell false degrade
- [ ] Document operational fallback behavior for degraded ledger API scenarios
