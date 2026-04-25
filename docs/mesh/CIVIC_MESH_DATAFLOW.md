# Civic Mesh Dataflow — Phase 1

## Purpose

Phase 1 turns Terminal workflows from stale placeholders into mesh filters.

The Terminal is the big pulse. It does not store the river. It reads the current, filters it into packets, and publishes repo-readable state for the rest of the Mobius mesh.

## Core Flow

```txt
PUBLIC DATA / REPO EVENTS / AGENT SIGNALS
        ↓
KV HOT
        ↓
ECHO LANE DIGEST
        ↓
MOBIUS AGENTS
        ↓
TERMINAL
        ↓
SUBSTRATE
        ↓
CIVIC LEDGER
        ↓
NEXT CRON
        ↓
AGENT TODO / PR / HUMAN MERGE
        ↓
CANON
```

## Layer Roles

```txt
KV HOT      = short-term live memory
ECHO Digest = filtered current
Agents      = interpreted current
Terminal    = visible current / operator pulse
Substrate   = remembered current / journal archive
Ledger      = proven current / attestations
GitHub PRs  = proposed future
Human merge = canon future
Next cron   = recursive improvement
```

## Workflow Responsibilities

### publish-cycle-state

Active scheduled pulse. Publishes `ledger/cycle-state.json` from `/api/terminal/snapshot-lite`.

### mesh-aggregate

Manual mesh filter. Reads Terminal snapshot, HOT Journal, EPICON, and lane diagnostics. Writes:

```txt
ledger/mesh-state.json
ledger/mesh-health.json
ledger/mesh-todos.json
```

### fetch-hive-world

Manual world signal filter. Reads Browser Shell / HIVE world state and writes:

```txt
ledger/hive-world-pulse.json
```

### world-update

Manual post-merge publisher. Publishes approved merged repository state into:

```txt
ledger/world-update.json
```

## Safety Rules

```txt
All data may enter HOT.
Not all HOT becomes priority.
Not all priority becomes canon.
Not all canon candidates become sealed.
```

Agents may propose, debug, and open PRs. Canon requires human merge.

## Idempotency

Workflow outputs include an `idempotency_key` built from:

```txt
node_id
event_type
cycle
source_hash
workflow_id
```

This prevents repeated workflow pulses from pretending to be new proof.

## Canon

The Terminal is the pulse.
The repos are organs.
The workflows are arteries.
The agents are immune cells.
The PR is the repair proposal.
The human merge is consent.
The Ledger is proof.
The Substrate is memory.

Mobius does not automate blindly.
Mobius cycles, learns, proposes, and heals as we walk.
