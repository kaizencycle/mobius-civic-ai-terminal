# EPICON Phase 11 — Dry Run Gate

## Purpose
Introduce a non-blocking EPICON gate that evaluates mutations before they are committed.

## Behavior
- Calls /api/epicon/check
- Returns PASS / NEEDS_CLARIFICATION / FAIL
- Does NOT block execution yet

## Next Step
Phase 12 will enforce blocking on FAIL states.

## Principle
Observe → Verify → THEN Enforce
