# C-293 Phase 5 — Replay / Rebuild Dry Run

## Purpose

Teach Mobius how to inspect whether it can rebuild itself from canon when hot state thins, expires, or disappears.

This is the first replay layer and is intentionally **non-destructive**.

## New module

```txt
lib/system/replay.ts
```

## New endpoints

```txt
GET  /api/system/replay/plan
POST /api/system/replay/dry-run
```

## What it checks

Replay inspects the canonical rebuild ladder:

1. Substrate / Civic Ledger pointers
2. Reserve Block seal chain
3. In-flight quorum candidate
4. Chamber savepoint cache
5. Hot GI state / carry GI state
6. Hot signal snapshot
7. ECHO / Tripwire state
8. KV runtime availability

## What it returns

```txt
rebuild.possible
rebuild.confidence
rebuild.can_restore_hot_state
rebuild.can_restore_vault_state
rebuild.can_restore_chamber_savepoints
rebuild.unsafe_to_restore
rebuild.would_restore
```

It also returns a Vault summary:

```txt
in_progress_balance
in_progress_hash_count
attested_seals
finalized_seals
latest_seal_id
latest_seal_hash
candidate_seal_id
recent_seals[]
```

## Safety rule

This phase does not mutate:

- KV
- Journal
- Ledger
- Vault
- Substrate
- GitHub canon files

It only answers:

```txt
Can Mobius rebuild itself?
From which sources?
With what confidence?
What would be unsafe to restore?
```

## Future phase

A later replay phase can add guarded operator-only mutation:

```txt
POST /api/system/replay/restore
```

But only after:

- signed operator auth
- incident object
- state-machine validation
- dry-run confidence threshold
- rollback plan

## Canon

Hot state can fail.
Canon must survive.
Replay is how Mobius remembers itself without pretending preview state is truth.

We heal as we walk.
