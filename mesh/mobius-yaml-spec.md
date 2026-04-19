# `mobius.yaml` — mesh + MCP bridge (spec)

This document describes the **`mesh`** root object used by Mobius Neural Substrate nodes and the optional **`mcp`** bridge block (C-286).

## Root

All fields live under **`mesh:`** (see repository root `mobius.yaml`).

## Core mesh fields (summary)

| Path | Description |
|------|-------------|
| `mesh.node_id` | Stable node identifier (e.g. `mobius-civic-ai-terminal`) |
| `mesh.node_type` | `app` \| `service` \| `library` (extensible) |
| `mesh.substrate_ref` | GitHub `org/repo` for constitutional / doctrine source |
| `mesh.version` | Semver string for this manifest |
| `mesh.tier` | Participation tier (e.g. `contributor`) |
| `mesh.covenant` | High-level covenant label (e.g. `integrity`) |
| `mesh.agent_affinity` | Sentinel / steward agents most involved with this node |
| `mesh.ledger` | Ledger integration (enabled, backend, `feed_url`, `push_to_substrate`) |
| `mesh.mii` | MII tracking preferences |
| `mesh.epicon` | EPICON policy (intent blocks, push on merge) |
| `mesh.mic` | MIC participation flags |

## MCP bridge block — `mesh.mcp`

When **`mesh.mcp.enabled`** is `true`, the node advertises a **Model Context Protocol** server so AI clients (Cursor, Claude, Codex, etc.) can invoke **declared tools** with **integrity metadata** recorded in `mobius.yaml`.

### Example (abbreviated)

```yaml
mesh:
  mcp:
    enabled: true
    server_url: "https://mobius-civic-ai-terminal.vercel.app/api/mcp"
    transport: "streamable-http"
    schema_version: "MCP-2025-03-26"
    integrity:
      require_gi_above: 0.5
      log_all_invocations: true
      invocation_agent: "HERMES"
      verification_agent: "ZEUS"
      mic_reward_on_invocation: false
    tools:
      - name: "get_integrity_snapshot"
        description: "…"
        endpoint: "/api/terminal/snapshot-lite"
        method: "GET"
        auth: "none"
        epicon_tag: "tool:integrity-read"
```

### Field reference — `mcp`

| Field | Required | Description |
|-------|----------|-------------|
| `mcp.enabled` | yes | If `true`, this node exposes an MCP server |
| `mcp.server_url` | yes | HTTPS URL of the MCP HTTP endpoint |
| `mcp.transport` | yes | `streamable-http` (default), `sse`, or `stdio` |
| `mcp.schema_version` | no | MCP protocol / schema label (default `MCP-2025-03-26`) |
| `mcp.integrity.require_gi_above` | no | Minimum GI for **node-level** tool gate (0 = off). Unknown GI must not block reads (Terminal implementation). |
| `mcp.integrity.log_all_invocations` | yes | When `true`, each tool call produces an EPICON ledger row (`source: mcp-bridge`) |
| `mcp.integrity.invocation_agent` | no | Agent name for routing / classification metadata |
| `mcp.integrity.verification_agent` | no | Agent name for verification posture (ZEUS) |
| `mcp.integrity.mic_reward_on_invocation` | no | Future: MIC reward on verified invocations |

### Field reference — `mcp.tools[]`

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Tool id (`snake_case`), must match server registration |
| `description` | yes | Human + model-readable capability description |
| `endpoint` | yes | Path on this node (relative to public origin) |
| `method` | yes | HTTP verb the bridge uses internally |
| `auth` | yes | `none` \| `bearer` \| `api-key` |
| `auth_env` | if auth ≠ `none` | Env var holding secret material |
| `epicon_tag` | yes | Tag applied on invocation log rows |
| `requires_gi_above` | no | Per-tool GI floor (overrides node default for that tool) |

## Discovery

- **Per-node:** `mobius.yaml` `mesh.mcp` block.
- **Aggregator index:** `mesh/mcp-discovery.json` (this repo carries a Terminal slice; Substrate may publish the union).
- **HTTP discovery:** `/.well-known/mcp.json` — this Terminal serves `public/.well-known/mcp.json`.

## Doctrine

See `docs/09-MESH/MNS_MCP_BRIDGE.md`.
