# C-292 — Journal HOT Lane Read Fix

## Issue

The C-292 Journal chamber showed:

```txt
No journal entries yet for this cycle
```

But the runtime logs showed `/api/chambers/journal` returning `200`, and prior writes were expected to exist in Upstash.

## Root Cause

The Journal write path now writes HOT entries into Redis lists:

```txt
journal:all
journal:<agent>
```

But the Journal read path was still treating `journal:*` keys as legacy value keys and reading them with `GET`.

That means list-backed HOT rows could exist in Upstash while the read path returned no parsed journal entries.

## Fix

Update `/api/agents/journal` HOT reader to understand both formats:

```txt
journal:all              → Redis list, read with LRANGE
journal:<agent>          → Redis list, read with LRANGE
journal:<agent>:<cycle>  → legacy value, read with GET
mobius:journal:*         → legacy/prefixed compatibility
```

## Why this matters

HOT is fast, but the reader must speak the same storage dialect as the writer.

This fix restores the HOT → Journal UI path without changing the canon/Substrate path.

## Validation Signal

Expected after deploy:

```txt
/api/chambers/journal?mode=hot&cycle=C-292
```

should show HOT rows when `journal:all` contains C-292 entries.

Agent filters should read per-agent list keys first:

```txt
/api/chambers/journal?mode=hot&cycle=C-292&agent=JADE
```

## Canon

The lane was not empty.
The reader was looking in the wrong shape.

HOT is fast.
CANON is earned.
MERGED is the operator view.

We heal as we walk.
