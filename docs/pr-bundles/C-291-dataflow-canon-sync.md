# C-291 — Dataflow Canon Sync

## Purpose

Make the Terminal dataflow smoother by separating fast UI hydration from durable canon continuity.

The intended flow is:

```txt
Agent event
  → hot KV journal lane
  → terminal watermark bump
  → canon outbox
  → Substrate journal write
  → watermark canon update
```

This keeps KV as the fast nervous system while Substrate remains the canonical memory layer.

## Changes

- Added `lib/terminal/watermark.ts` for versioned lane watermarks.
- Added `/api/terminal/watermark` so the UI can cheaply detect lane changes before rehydrating heavier chamber data.
- Added `lib/agents/journalCanonOutbox.ts` for queued Substrate journal writes.
- Added `/api/agents/journal/canonize` to process pending journal canon writes.
- Updated `appendJournalLaneEntry` so KV journal writes automatically enqueue canonical Substrate writes by default.
- Updated direct journal POST mirroring to avoid duplicate canon enqueue after a direct Substrate write.

## Why this helps UI/UX

The UI no longer needs to infer freshness from large snapshot payloads alone. It can poll the small watermark endpoint and rehydrate only the lanes that changed.

## Canon continuity

Agent journal writes that previously landed only in KV now get a canon path:

```txt
KV hot journal → journal:canon:outbox → Mobius-Substrate journals/{agent}/...
```

The UI can represent the progression as:

- HOT
- CANON PENDING
- CANON WRITTEN
- CANON FAILED

## Operational note

`/api/agents/journal/canonize` can be called by cron or manually after agent cycles. The route uses existing service auth for POST and allows GET for simple operational checks.
