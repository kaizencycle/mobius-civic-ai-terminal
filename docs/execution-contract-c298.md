# C-298 Execution Contract Layer

## Purpose

Define the minimum requirements for any future transition from orchestration dry-run to controlled execution.

This contract is not executable code. It is a policy gate for future implementation.

## Core Law

Simulation is not execution.
Readiness is not authorization.
Recommendation is not enforcement.
Local inference is not truth.

## Execution Preconditions

Before any orchestration endpoint may mutate state, all conditions below must be true:

1. Automation readiness status is `ready_for_dry_run` for at least one full cycle.
2. Router correction rate is within accepted bounds.
3. Compute Integrity Score is above the configured threshold.
4. Agent reasoning is available and route annotated.
5. Vault, Canon, and Replay context are readable.
6. Operator acknowledgement is present for the execution class.
7. Quorum rules are satisfied for the target action.
8. Receipt bundle exists before execution.
9. Execution result is written as a receipt before any downstream promotion.
10. Rollback or quarantine path exists for degraded or failed execution.

## Authority Boundaries

| Layer | May Execute | May Mutate Truth | Notes |
| --- | --- | --- | --- |
| Router | No | No | Advisory only until enforcement phase |
| Local agents | Limited | No | May produce previews, summaries, and receipts |
| Cloud agents | Limited | No | May verify or reason, but cannot alone define truth |
| ZEUS | Verify | No direct mutation | Verification authority, not sole writer |
| Ledger adapter | Write receipts | Yes, receipt layer only | Requires receipt bundle + operator ack |
| Vault | Seal only after gates | Yes | Requires quorum, GI, sustain, degraded-count gates |
| Canon | Promote only by policy | Yes | No direct agent promotion without policy approval |
| Replay | Inspect/rebuild plan | No rewrite | Replay can annotate, not rewrite history |

## Execution Classes

### Class 0 — Observation

Examples: health checks, metrics, router decisions.

Requirements:
- no operator ack required
- no mutation allowed

### Class 1 — Receipt Write

Examples: agent action receipt written to Ledger.

Requirements:
- receipt bundle
- operator ack
- dedupe key
- dry-run preview available

### Class 2 — Quorum Attestation

Examples: agent attestation set for seal consideration.

Requirements:
- required agent list
- threshold rule
- timeout behavior
- missing-agent report
- no partial promotion

### Class 3 — Vault Seal

Examples: reserve block or tranche seal.

Requirements:
- GI threshold met
- sustain streak met
- quorum met
- degraded agent count acceptable
- idempotency guard
- ledger receipt
- quarantine fallback

### Class 4 — Canon Promotion

Examples: promoting a sealed receipt/tranche into canonical timeline.

Requirements:
- explicit policy approval
- replay comparison
- immutable historical preservation
- operator-visible diff

## Rollback and Quarantine Rules

Rollback must never erase history.

Allowed:
- mark receipt as superseded
- quarantine candidate execution
- append corrective receipt
- annotate Canon timeline as disputed

Forbidden:
- deleting historical receipts
- rewriting sealed blocks
- hiding failed attempts
- treating fallback output as verified truth

## Required Endpoint Behavior

Future execution endpoints must return:

```json
{
  "ok": true,
  "executed": false,
  "dry_run": true,
  "class": "Class 1",
  "preconditions": [],
  "receipts": [],
  "blocked_by": [],
  "would_mutate": false
}
```

If degraded, response must include explicit degraded state. Do not return a clean-looking success for hidden failure.

## Phase 11 Boundary

C-298 Phase 11 adds this contract only. It does not enable execution.
