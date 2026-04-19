# `mobius.yaml` v1 — pulse, ingest, and trust (Terminal canon)

This document is the **declaration contract** for a Mobius node in this repository. Runtime code may **read** it; **`mobius.yaml` does not perform writes**.

## Canon

1. **`mobius.yaml` declares** who the node is, what it emits (`pulse`), where it publishes, where **others** should send durable writes (`ingest`), which lanes it is **authoritative** for, and **policy** (canonical ledger node, hashing).
2. **The write path stays:** KV / runtime state → writer / orchestrator → **declared ingest target** → durable ledger → optional feed mirror.
3. **Operator nodes** (Terminal) must not declare themselves **`canonical_ledger_node`**; that belongs to the ledger tier (`civic-protocol-core`).

## Root `version`

| Field | Description |
|-------|-------------|
| `version` | Schema string, e.g. `"1.0"` |

## `mesh:` — identity and mesh participation

| Field | Description |
|-------|-------------|
| `mesh.enabled` | Whether this manifest is active |
| `mesh.node_id` | Stable id (e.g. `mobius-terminal`) |
| `mesh.node_name` | Human-readable name |
| `mesh.tier` | `sentinel` \| `operator` \| `ledger` \| `client` \| `service` |
| `mesh.role` | `protocol_cortex` \| `operator_console` \| `ledger_node` \| … |
| `mesh.repository` | `full_name`, `default_branch` |
| `mesh.discovery` | `enabled`, `registry_participation` |

Legacy fields (`node_type`, `substrate_ref`, `ledger`, `mii`, `epicon`, `mic`) may remain for backward compatibility until all nodes migrate.

## `pulse:` — what the node emits and exposes

**Rule:** `pulse` describes **emissions and public surfaces**, not durable ingest.

| Field | Description |
|-------|-------------|
| `pulse.enabled` | Pulse lane active |
| `pulse.health_url` | Liveness URL |
| `pulse.feed_url` | Operator-visible feed (e.g. EPICON) |
| `pulse.snapshot_url` | Compact snapshot (e.g. snapshot-lite) |
| `pulse.freshness_sla_seconds` | Staleness budget for pulse consumers |
| `pulse.integrity_weight` | Weight in aggregated pulse (Substrate-side) |
| `pulse.lanes` | Lane vocabulary (see below) |
| `pulse.authoritative_for` | Capability keys this node owns (prevents lane confusion) |
| `pulse.emits` | Booleans: `heartbeat`, `gi`, `mii`, `mic`, `vault`, `tripwire`, `anomalies` |

## `ingest:` — where this node accepts or forwards durable writes

**Rule:** `ingest` describes **targets and accepted payload types**, not execution.

| Field | Description |
|-------|-------------|
| `ingest.enabled` | Ingest client/target active |
| `ingest.mode` | `ledger_target` \| `client_of_other_node` \| `aggregator_only` |
| `ingest.targets[]` | For `client_of_other_node`: `node_id`, `purpose`, `write_url`, `auth`, `accepts` |
| `ingest.write_url` | Ledger nodes may set a single URL (alternative to `targets`) |

**Terminal resolution:** if `ingest.targets[0].write_url` is empty, the runtime uses **`MOBIUS_INGEST_WRITE_URL`**. Bearer material uses **`MOBIUS_INGEST_BEARER_TOKEN`**, then `AGENT_SERVICE_TOKEN`, then `MOBIUS_SERVICE_SECRET` (see `.env.example`).

Only **`ledger_target`** nodes should be the canonical acceptor for hashed ledger payloads.

## `mcp:` — MCP edge (Terminal)

| Field | Description |
|-------|-------------|
| `mcp.enabled` | Expose `/api/mcp` |
| `mcp.server_url` | Public MCP URL |
| `mcp.discovery_url` | `/.well-known/mcp.json` or equivalent |
| `mcp.transport` | e.g. `streamable-http` |
| `mcp.tools[]` | Declared tools (name, endpoint, method, auth, …) |

Implementation: `app/api/mcp/route.ts`, `lib/mcp/mobius-terminal-mcp.ts`, `docs/09-MESH/MNS_MCP_BRIDGE.md`.

## `policy:` — trust boundaries

| Field | Description |
|-------|-------------|
| `policy.write_truth_locally` | If true, this node persists canonical truth locally (ledger nodes) |
| `policy.mirror_feed_to_repo` | Optional GitHub / feed mirror |
| `policy.canonical_ledger_node` | Node id of the durable ledger (e.g. `civic-protocol-core`) |
| `policy.hash_algorithm` | e.g. `sha256` |

## Payload vocabulary (v1)

Tight list for `ingest.targets[].accepts` and cross-node contracts:

- `EPICON_ENTRY_V1`
- `MIC_READINESS_V1`
- `MIC_SEAL_V1`
- `MIC_RESERVE_RECONCILIATION_V1`
- `MIC_GENESIS_BLOCK`
- `MOBIUS_PULSE_V1` (future: `MOBIUS_PULSE_V2`)

## Lane vocabulary

`integrity`, `signals`, `tripwire`, `heartbeat`, `mic_readiness`, `vault`, `ledger`, `mesh`, `mcp` (extend only with mesh-wide agreement).

## Rules (summary)

1. **Pulse** = what the node emits.  
2. **Ingest** = what it accepts / where others write.  
3. **`authoritative_for`** = prevents lane confusion.  
4. Only **ledger** nodes use `ingest.mode: ledger_target` as canonical acceptor.  
5. **Operator** nodes forward hashed payloads to the declared target; they do not claim canonical ledger.

## Runtime helpers (this repo)

- `lib/mesh/loadMobiusYaml.ts` — parse `mobius.yaml`, resolve ingest URL / bearer.  
- `lib/mesh/ingestClient.ts` — `postMobiusIngest({ type, payload })` with **hash envelope** before POST.

## Related

- `mobius.yaml` (repository root) — live Terminal manifest.  
- `mesh/mcp-discovery.json` — MCP discovery slice.  
- `docs/09-MESH/MNS_MCP_BRIDGE.md` — MCP doctrine.
