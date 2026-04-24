# C-292 — KV Permission Healthcheck

## Purpose

After the April security incident and production key rotation, Mobius needs a direct runtime check that confirms the active Upstash / Vercel KV credentials can do more than read.

The Vercel logs showed repeated `NOPERM` failures for `SET`, which means routes could return HTTP 200 while failing to refresh hot state.

## Problem

The Terminal can appear alive while data freshness is degraded:

- API reads return 200
- cached/stale payloads continue serving
- write-path refreshes fail
- UI keeps showing stale state

Observed failing operations included:

- `SET echo:kv:heartbeat`
- `SET TRIPWIRE_STATE`
- `SET SENTIMENT_SNAPSHOT`
- MII batch writes

## Change

Add:

```txt
GET /api/health/kv-permissions
```

The route checks whether the production KV token supports:

- `SET`
- `GET`
- `INCR`
- `LPUSH`
- `LRANGE`
- `LTRIM`
- `EXPIRE`

## Expected response

Healthy:

```json
{
  "ok": true,
  "read": true,
  "write": true,
  "counter": true,
  "list": true,
  "configured": true,
  "errors": [],
  "timestamp": "..."
}
```

Degraded:

```json
{
  "ok": false,
  "read": true,
  "write": false,
  "counter": false,
  "list": false,
  "configured": true,
  "errors": ["set_failed: NOPERM ..."],
  "timestamp": "..."
}
```

## Why this helps

This gives Mobius a fast way to distinguish between:

- UI bug
- stale cache
- missing env vars
- read-only KV token
- rotated token with insufficient permissions

## Acceptance criteria

- [ ] Route returns 200 when all KV operations pass.
- [ ] Route returns 503 when env vars are missing or any required operation fails.
- [ ] Response never exposes token values.
- [ ] Response uses `Cache-Control: no-store`.
- [ ] Probe keys expire quickly.

## Operator checklist

After rotating Vercel / Upstash keys:

1. Redeploy production.
2. Open `/api/health/kv-permissions`.
3. Confirm `ok: true`.
4. Confirm no `NOPERM` messages appear in Vercel runtime logs.
5. Recheck `/api/terminal/snapshot`, `/api/terminal/snapshot-lite`, `/api/terminal/watermark`, and `/api/agents/journal`.
