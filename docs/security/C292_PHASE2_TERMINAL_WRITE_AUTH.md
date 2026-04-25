# C-292 Phase 2 — Terminal Write Auth

## Scope

Phase 2 hardens the Terminal write paths found during the C-292 mesh cleanup scan.

Protected paths:

```txt
POST /api/echo/ingest
MCP tool: post_epicon_entry
```

Read-only MCP tools remain available, but write-trigger tools now require explicit write authorization.

## Write token sources

The Terminal accepts one of these configured env secrets:

```txt
AGENT_SERVICE_TOKEN
CRON_SECRET
MOBIUS_WRITE_TOKEN
```

A caller may pass the token through one of:

```txt
Authorization: Bearer <token>
x-agent-service-token: <token>
x-cron-secret: <token>
x-mobius-write-token: <token>
```

For MCP `post_epicon_entry`, the tool input must include:

```json
{
  "writeToken": "..."
}
```

The token is redacted before invocation logging.

## Fail-closed behavior

If no write token is configured, write endpoints return:

```txt
503 write_auth_not_configured
```

If a caller omits or sends the wrong token, write endpoints return:

```txt
401 write_auth_required
```

## Operator requirements

Set at least one production secret in Vercel:

```txt
AGENT_SERVICE_TOKEN=<random strong secret>
```

Update Vercel Cron or agent callers to include:

```txt
Authorization: Bearer $AGENT_SERVICE_TOKEN
```

## Canon

Read lanes may remain public.
Write lanes must be gated.
GI gates are not authentication.
Proof begins with authorized writes.

We heal as we walk.
