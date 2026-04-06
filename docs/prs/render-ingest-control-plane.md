# PR title

refactor(ingest): align terminal with live Render-backed intake and safe promotion flow

# PR body

## Summary

This PR aligns the terminal with the ingest architecture that is already live in the repo.

It does not rebuild Mobius from scratch.
It hardens and clarifies the existing flow:

Render/backend ingest → pending intake → promotion → committed memory → terminal read model

## What is already live

### EPICON feed
`/api/epicon/feed` already merges:
- Render ledger API entries
- Redis feed entries (`mobius:epicon:feed`, `epicon:feed`)
- EVE synthesis Redis entries
- local memory ledger rows
- GitHub-derived feed events
- memory-feed rows

### Promotion
`/api/epicon/promote` already:
- reads pending EPICON intake
- routes items by category to agent lanes
- writes committed `agent_commit` rows
- appends journal-lane entries after commit

### Journal
`/api/agents/journal` already exists as a separate Redis-backed reasoning lane using:
- `journal:all`
- `journal:<agent>`

## Problem

The substrate is more alive than the terminal presentation.

Current gaps:
- public terminal bootstrap still falls back too easily to the resilient shell
- adapter behavior is inconsistent across live/degraded/mock paths
- promotion status and promotion execution are too tightly coupled
- Events and Journal are separate truth lanes but are not surfaced clearly in the terminal
- ingest is live, but the terminal does not always reflect that truth cleanly

## Goals

1. Make terminal bootstrap more reliable
2. Make promotion status polling side-effect free
3. Normalize adapter fallback behavior
4. Treat Render-backed intake as the primary authoritative ingest surface
5. Make Ledger chamber truthfulness clearer

## Changes

### 1. Server bootstrap snapshot for `/terminal`
- fetch initial terminal snapshot on the server
- pass initial state into the client
- reduce first-load dependency on fragile client hydration

### 2. Separate promotion status from promotion execution
- add side-effect-free promotion status read path
- keep promotion execution on explicit POST
- prevent browser polling from triggering promotion-like behavior

### 3. Normalize adapter fallbacks
- standardize live → degraded → mock behavior across:
  - agents
  - tripwires
  - EPICON feed
  - integrity
  - related chamber surfaces
- prefer internal `/api/...` routes before mock fallback

### 4. Strengthen ingest truthfulness
- preserve source labels consistently:
  - `ledger-api`
  - `agent_commit`
  - `eve-synthesis`
  - `github-commit`
  - `memory-feed`
- reduce false degraded states caused by adapter mismatch
- keep pending intake separate from committed memory

### 5. Clarify Ledger chamber
- make Events and Journal clearly distinct
- default to Events when committed rows exist in active cycle
- expose counts for:
  - committed event rows
  - journal rows
  - pending promotable rows

## Non-goals

This PR does not:
- replace Redis-backed lanes
- redesign all terminal chambers
- rewrite agent routing from scratch
- replace the existing EPICON pipeline

## Validation

- `/terminal` renders live bootstrap data on first load
- promotion status polling is side-effect free
- internal routes are preferred before mock fallback
- committed EPICON rows still appear in feed
- journal lane remains writable after promotion
- Ledger chamber clearly distinguishes Events from Journal

## Why

Mobius already has live substrate pieces.
This PR makes the terminal reflect that reality more faithfully and reduces friction in the ingest/promotion/read-model loop.

## Suggested checklist

## Checklist

- [ ] Add server bootstrap snapshot for `/terminal`
- [ ] Pass initial terminal state into client
- [ ] Add side-effect-free promotion status route
- [ ] Keep promotion execution on explicit POST only
- [ ] Normalize adapter fallback behavior
- [ ] Prefer internal `/api/...` routes before mocks
- [ ] Clarify Events vs Journal in Ledger chamber
- [ ] Default Ledger to Events when committed rows exist
- [ ] Preserve source labels across feed rows
- [ ] Verify no new client-side terminal regressions

## Blunt implementation note

The cleanest merge order is:
1. bootstrap snapshot
2. promotion status split
3. adapter normalization
4. ledger chamber truthfulness

That’s the least-resistance micromouse route.
