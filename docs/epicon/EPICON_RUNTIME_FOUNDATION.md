# EPICON Runtime Foundation (C-300)

## Purpose

Introduce EPICON as a runtime-usable structure without enforcing hard mutation blocking yet.

## What is added

- EpiconPacket types
- Consensus scoring engine (ECS)
- API endpoint for validation (/api/epicon/check)

## What is NOT enforced yet

- No mutation blocking
- No merge gating
- No ledger enforcement

## Next Phase (C-301)

- Gate cron endpoints behind EPICON-03 PASS
- Attach epicon_hash to ledger writes
- Surface consensus in UI

## Operator Note

This phase establishes structure, not authority.

Authority begins when EPICON blocks reality changes.
