# C-292 Phase 1 Civic Mesh Contract

## Purpose

Start Phase 1 in the Terminal repo: define the master Civic Mesh workflow contract and convert stale workflow stubs into useful mesh filters.

## Changed

### mobius.yaml

- Bumped manifest to `version: 1.1`.
- Added `mesh.civic_mesh` role and node map.
- Added `flow` model:
  - KV HOT
  - ECHO lane digest
  - agents as pressure governors
  - Terminal as operator view, not storage
  - overflow route: HOT → Substrate Journal → Civic Ledger Proof
- Added ingest idempotency policy.
- Added workflow statuses: active / manual / planned / archived.
- Marked placeholder workflows as real manual mesh filters.
- Marked `catalog` and `gi-gate` as planned until they stop using hardcoded/fallback GI.

### mesh-aggregate.yml

Converted from placeholder to manual mesh aggregate filter.

Outputs:

```txt
ledger/mesh-state.json
ledger/mesh-health.json
ledger/mesh-todos.json
```

### fetch-hive-world.yml

Converted from placeholder to manual world signal filter.

Output:

```txt
ledger/hive-world-pulse.json
```

### world-update.yml

Converted from placeholder to manual post-merge world publisher.

Output:

```txt
ledger/world-update.json
```

### docs/mesh/CIVIC_MESH_DATAFLOW.md

Added Phase 1 dataflow contract and canon.

## Safety

No autonomous risky writes. These workflows publish JSON state into `ledger/` for operator/agent review.

Canon still requires human merge.

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
