# C-293 Phase 6 — Incident + Rollback Protocol

## Purpose

Give Mobius a safe incident trail and rollback planning layer.

Phase 5 taught Mobius how to ask whether it can rebuild from canon.
Phase 6 teaches Mobius how to record a failure and recommend a survival path without erasing evidence or auto-mutating deployments.

## New module

```txt
lib/system/incidents.ts
```

## New endpoints

```txt
GET  /api/system/incidents
POST /api/system/incidents/report
POST /api/system/rollback/plan
```

## Incident object

```json
{
  "incident_id": "INC-C293-...",
  "cycle": "C-293",
  "severity": "high",
  "state": "open",
  "affected": ["vault", "ledger"],
  "trigger": "endpoint_failure",
  "evidence": ["/api/vault/status returned 500"],
  "fallback": "use savepoint cache",
  "rollback_recommended": true,
  "rollback_recommendation": "fallback",
  "operator_required": true
}
```

## Rollback planning

`POST /api/system/rollback/plan` returns a safe plan only.

It does not:

- redeploy
- revert PRs
- delete evidence
- mutate ledger/Substrate
- unlock Fountain
- modify Vault

## Safety rules

Rollback is not execution in this phase. It is recommendation.

Every plan includes:

- replay dry-run check
- affected chamber inspection
- savepoint or previous deployment confirmation
- operator approval requirement
- evidence preservation rule
- forward-fix requirement

## Forbidden actions

```txt
auto_rollback_without_operator
delete_incident_evidence
erase_ledger_or_substrate_records
unlock_fountain_as_rollback_side_effect
```

## Future phase

A later guarded execution phase may add:

```txt
POST /api/system/rollback/execute
```

Only after:

- signed operator auth
- incident exists
- replay dry-run passes
- state-machine transition is allowed
- rollback target is explicit
- evidence is preserved

## Canon

Replay tells Mobius how to remember.
Rollback tells Mobius how to survive a bad change.

No rollback without proof.
No rollback without operator consent.
No rollback that erases the incident trail.

We heal as we walk.
