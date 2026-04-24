# C-291 — ZEUS Red Team Protocol

## Purpose

Define ZEUS as the adversarial integrity verifier for Mobius.

ZEUS is not only a verifier of good events. ZEUS should also ask how the system could be abused, poisoned, replayed, overloaded, or tricked into false canon.

Core principle:

> ZEUS attacks the signal before the system trusts it.

## Role

```txt
ZEUS_RED_TEAM
Role: Adversarial integrity verifier
Purpose: Stress-test Mobius against manipulation, poisoning, replay, route abuse, and false canon
Authority: inspect, challenge, flag, quarantine
Cannot: mutate GI directly, erase canon, impersonate agents, or auto-patch without operator approval
```

## Threat Classes

ZEUS should watch four primary attack classes.

### 1. Route Abuse

Examples:

- public GET routes mutating state
- unprotected POST routes
- cron trigger exposure
- missing service auth
- excessive diagnostics on public routes
- expensive public reads with no pacing

### 2. Data Poisoning

Examples:

- fake EPICON rows
- fake journal writes
- spoofed agent names
- wrong source labels
- overtrusted GitHub or API source metadata
- low-confidence signals treated as verified

### 3. Replay / Duplicate Attacks

Examples:

- repeated events
- old signals reintroduced as new
- duplicate journal writes
- idempotency bypass attempts
- canon outbox replay

### 4. Canon Corruption

Examples:

- hot KV rows treated as canon too early
- Substrate writes without quorum
- EVE synthesis sealed without JADE verification
- ZEUS seal skipped on high-risk events
- ledger rows marked committed without explicit verification or merge evidence

## ZEUS Red Team Pulse

ZEUS should produce a recurring Red Team Pulse per cycle.

Example:

```txt
ZEUS RED TEAM PULSE — C-291

Surface: Terminal Public API
Risk: Elevated

Findings:
- Mutating GET route candidate: /api/cron/sweep
- Public diagnostics expose KV health details
- Ledger status inference too broad for GitHub source rows
- Journal preview rows require provenance labels

Recommended controls:
- POST-only for mutations
- service auth required on write routes
- source confidence labels
- public/operator UI split
- JADE seal required before canon
```

## Proposed Metric: ESI

Add an Exposure Surface Index.

```txt
ESI = Exposure Surface Index
```

Ranges:

```txt
0.00–0.25 = low exposure
0.26–0.50 = watch
0.51–0.75 = elevated
0.76–1.00 = critical
```

Inputs:

- public routes count
- mutating GET route count
- write routes without service auth
- diagnostic leakage
- stale cache serving control data
- agent spoof risk
- canon pending backlog
- failed verification count
- public API cost/rate-limit exposure

Mobius metrics become:

```txt
GI  = integrity health
MII = micro integrity
ESI = exposure surface risk
```

## Red Team Loop

Every cycle:

1. ZEUS scans route surface.
2. ZEUS classifies public/operator exposure.
3. ZEUS checks for mutating GET routes.
4. ZEUS checks write routes for service auth.
5. ZEUS checks agent write provenance.
6. ZEUS checks idempotency and replay protection.
7. ZEUS checks whether hot data is being treated as canon.
8. ZEUS writes a Red Team Pulse.
9. JADE can verify the pulse as canon memory.
10. Operator approves fixes or follow-up PRs.

## Public / Operator Split

Public users should see meaning, not machinery.

Public Terminal:

- public GI summary
- high-level lane health
- delayed or blurred operational state
- no raw route diagnostics
- no exact write pipeline internals
- no secret-bearing health details

Operator Terminal:

- route diagnostics
- KV / Redis state
- canon outbox
- journal provenance
- cron health
- raw ledger rows
- red team findings

Guiding phrase:

> Public users should see the weather report. Operators should see the radar station.

## Authority Boundaries

ZEUS can:

- inspect route metadata
- classify exposure
- flag unsafe patterns
- recommend quarantine
- write Red Team Pulse reports
- block canon seal recommendations when evidence is weak

ZEUS cannot:

- mutate GI directly
- erase canon
- impersonate another agent
- execute destructive tests in production
- auto-merge security fixes
- seal EVE synthesis without JADE verification

## Acceptance Criteria

- [ ] Add a route inventory source for ZEUS review.
- [ ] Classify routes as public-read, operator-read, service-write, or cron-write.
- [ ] Identify mutating GET routes.
- [ ] Identify write routes without service auth.
- [ ] Emit ESI score.
- [ ] Write ZEUS Red Team Pulse to KV.
- [ ] Allow JADE to verify the Red Team Pulse.
- [ ] Display latest Red Team Pulse in Operator Mode.
- [ ] Keep Public Mode free of raw attack-map diagnostics.

## Non-Goals

- [ ] Do not run destructive red-team tests in production.
- [ ] Do not expose secrets or route internals publicly.
- [ ] Do not give ZEUS permission to patch or merge without operator approval.
- [ ] Do not let ESI overwrite GI; ESI is a separate exposure metric.

## Canon

ATLAS sees the signal.
EVE explains the signal.
JADE remembers the signal.
ZEUS attacks the signal before Mobius trusts it.
