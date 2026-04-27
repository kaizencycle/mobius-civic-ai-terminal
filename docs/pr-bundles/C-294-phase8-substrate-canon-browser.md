# C-293 Phase 8 — Substrate Canon Browser

## Summary

Adds a read-only Canon Browser for inspecting:
- Reserve Blocks
- Historical attestations
- Substrate pointers

## API

- GET /api/substrate/canon
- GET /api/substrate/canon?type=reserve_blocks
- GET /api/substrate/canon?seal_id=<seal_id>

## UI

- /terminal/canon

## Guarantees

- Read-only
- No mutation
- No auto-attestation
- No rollback triggers

## Canon

Substrate canon exposes proof.
It does not rewrite history.
It does not execute authority.
