# Mobius MCP bridge — doctrine

## What it is

Every Mobius mesh node that sets **`mesh.mcp.enabled: true`** in `mobius.yaml` is simultaneously:

1. A **mesh node** — EPICON-aware, MII-tracked, linked to Substrate doctrine.
2. An **MCP server** — discoverable via `mesh/mcp-discovery.json`, `/.well-known/mcp.json`, and the declared `server_url`.
3. An **integrity-governed capability surface** — tool calls can be **GI-gated**, and when logging is on, each invocation produces an **EPICON** row (`source: mcp-bridge`) via the same Redis list path as other civic ledger writes (`pushLedgerEntry`).

## Why it matters

Without a bridge, an AI client calling HTTP APIs directly leaves **weak provenance**: the Terminal sees traffic, but not **intent** structured for civic audit.

With the MCP bridge, the **tool name**, **arguments**, and **GI context** can be attached to a ledger row so operators (and ZEUS flows) can reason about **agent behavior over time** — the instrumentation layer for the Kaizen Turing Test thesis at infrastructure depth.

## Signal flow (Terminal implementation)

```
MCP client → POST /api/mcp (streamable HTTP)
         → MCP tool handler
         → GI gate (KV `gi:latest` when present)
         → internal fetch to documented REST routes
         → logMcpInvocation → pushLedgerEntry → mobius:epicon:feed (+ epicon:feed mirror)
```

Read tools use **`NEXT_PUBLIC_SITE_URL`** (fallback `VERCEL_URL` / localhost) for same-origin internal fetches. Set the public URL in production so the bridge resolves correctly.

## Constitutional constraints (defaults in this repo)

- **Read tools:** node gate `require_gi_above: 0.5` — if GI is **known** and below threshold, the tool returns `gi_gate_blocked` without calling downstream APIs.
- **Write tool (`post_epicon_entry`):** per-tool gate **0.6** — maps to **POST `/api/echo/ingest`** (operational ingest). Intent fields are included in the MCP log row body; they are **not** automatically a user EPICON submission (use `/api/epicon/create` with appropriate auth for that).

## One-line canon

**The tools do not only execute — they leave a ledger trace.**
