# Thought-broker Render Scheduler (EVE + ATLAS)

This runbook migrates scheduler duties from Vercel cron to the Render thought-broker service.

## STEP 0 — Read shared world state (C-274)

Before scheduling or interpreting failures, workers may use:

**GET** `https://mobius-civic-ai-terminal.vercel.app/api/terminal/snapshot`

Extract **cycle**, **gi**, **anomalies**, **echo** / **epicon**, **sentiment**, **substrate** (**`substrate.agents`** / **`substrate.latest`**). Use as shared context; avoid duplicate fetches of USGS / CoinGecko / EONET when the snapshot already normalizes them.

## 1) Install runtime dependency on thought-broker

```bash
npm install node-cron
```

## 2) Deploy scheduler worker

Use `scripts/thought-broker-scheduler.mjs` as the worker entrypoint on thought-broker Render.

Required environment variables:

- `TERMINAL_URL` — production Vercel URL for mobius terminal.
- `CRON_SECRET` (or `RENDER_SCHEDULER_SECRET`) — shared service secret accepted by terminal protected routes.

## 3) Scheduled jobs migrated

- **EVE** cycle advance: `POST /api/eve/cycle-advance` at `05:05 UTC` daily.
- **ATLAS** watchdog: `POST /api/cron/watchdog` every 30 minutes.

## 4) Disable duplicate Vercel scheduler jobs

After Render scheduler is confirmed healthy:

1. Disable any overlapping Vercel cron entries hitting these endpoints.
2. Keep endpoint auth enabled (Bearer secret) and monitor logs on both sides.

## 5) Smoke test

Trigger each endpoint once from thought-broker and verify:

- HTTP 200 response,
- entries appear in terminal logs,
- journal/heartbeat updates in `/api/agents/journal` and `/api/runtime/status`.
