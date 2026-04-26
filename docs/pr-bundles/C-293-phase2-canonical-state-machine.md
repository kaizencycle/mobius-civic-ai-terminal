# C-293 Phase 2 — Canonical State Machine

## Purpose

Give Mobius explicit lifecycle states for protocol objects.

Phase 1 gave the agents one shared quorum state reader. Phase 2 adds the state language that tells agents and operators what an object *is* before they treat it as canon, sealed, disputed, or immortalized.

## New protocol module

```txt
lib/protocol/state-machine.ts
```

Defines lifecycle states for:

- Vault Reserve Blocks
- Journals
- Ledger events
- Quorum decisions

## New endpoint

```txt
GET /api/protocol/state-machine
```

Returns the canonical state machine and allowed transitions.

## Quorum state integration

`GET /api/quorum/state` now includes:

```json
{
  "state_machine": {
    "version": "C-293.phase2.v1",
    "quorum_state": "waiting",
    "vault_block_state": "quorum_pending"
  }
}
```

## Core lifecycle examples

### Reserve Block

```txt
accumulating
→ candidate
→ quorum_pending
→ attested
→ substrate_attested
→ immortalized
→ fountain_pending
→ fountain_eligible
→ emitted
```

### Journal

```txt
hot
→ saved
→ canonical
→ substrate_attested
→ archived
```

### Ledger

```txt
hot
→ candidate
→ attested
→ sealed
→ immortalized
```

### Quorum

```txt
none
→ forming
→ waiting
→ ready
→ attested
→ substrate_pending
→ immortalized
```

## Why this matters

Before this phase, state was implicit across APIs and UI labels. That allowed preview, saved, candidate, attested, sealed, and immortalized states to blur together.

The state machine makes those boundaries explicit.

## Canon

A signal is not canon because it appears.
A Block is not immortal because it is sealed.
A Journal is not permanent because it is hot.
A Ledger row is not proof until its state says so.

State comes before trust.

We heal as we walk.
