# Mobius Automation Index — C-298 Advisory

## Purpose

Define the next-cycle hardening path for Mobius Class B orchestration without enabling new runtime mutation in this PR.

This document is advisory only. Runtime implementation must proceed in later phases with build validation and operator review.

## Strategic Principles

1. Idempotency first: every cron endpoint must safely re-run without side effects.
2. Degraded-state transparency: never hide failures behind successful-looking responses.
3. Quorum atomicity: Vault sealing must be all-or-nothing; partial attests remain pending or quarantined.
4. Observability by design: every agent action should produce structured JSON suitable for EPICON attestation.
5. Fallback paths: every LLM call, KV read, or external API call must have a non-LLM fallback.

## Production Hardening Priorities

### P0 — Foundation Fixes

- Fix `mic:readiness:feed` WRONGTYPE by standardizing key type and adding a migration script.
- Add signal-source health checks for HERMES micro-agents.
- Harden cron authentication and prevent preview deployments from running production cron work.
- Ensure all cron endpoints return structured health and explicit degraded state.

### P1 — Agent Orchestration Scaffolding

- Introduce a shared CivicAgent base contract.
- Add journal persistence for every agent execution.
- Define execution order for the 10-minute window.
- Keep agent failures degraded, not fatal.

Recommended ordering:

```txt
t+0:00  ATLAS + DAEDALUS + ECHO bootstrap
t+1:00  Vault attestation collection
t+3:00  HERMES signal routing
t+5:00  ZEUS + EVE + JADE quorum agents
t+6:00  Seal eligibility check
```

### P2 — Quorum and Vault Sealing Logic

- Evaluate required attestations deterministically.
- Keep seal execution idempotent by cycle.
- Require GI threshold, quorum, sustain streak, and degraded-agent limit before any seal.
- Preserve all partial attempts as receipts, not final truth.

### P3 — Observability and Resilience

- Add structured request and agent duration logging.
- Add degraded-state fallback registry.
- Add `/api/system/health` with agents, quorum, seal, KV, cron, and overall status.

## Minimal Mobius Node Path

A Raspberry Pi node should remain runtime/data only:

- local JSON KV
- atomic file writes
- HMAC-signed OAA-style payloads
- structured EPICON-compatible logs
- optional MQTT mesh
- optional UPS low-power handling
- plugin system for custom signal sources

## Production KV Requirements for Pi Nodes

The production node KV must be:

- file locked with `fcntl.flock`
- atomically written using tempfile + fsync + rename
- optionally HMAC signed with `OAA_HMAC_KEY`
- safe against cron overlap and power loss

## Router Interaction

The Mobius Router should classify automation tasks before execution:

| Task | Route |
| --- | --- |
| local heartbeat parse | local |
| private Pi logs | local |
| seal eligibility | cloud+zeus |
| quorum replay | cloud+zeus |
| plugin signal classification | hybrid |
| operator deployment decision | cloud |

## Phase 8 Boundary

This PR only adds advisory documentation and operator visibility. It does not add cron behavior, Pi scripts, MQTT, plugins, seal execution, or route enforcement.

## Next Implementation Candidate

C-298 Phase 9 should add a read-only Automation Index endpoint that reports which hardening prerequisites are present in the repo and which are missing.
