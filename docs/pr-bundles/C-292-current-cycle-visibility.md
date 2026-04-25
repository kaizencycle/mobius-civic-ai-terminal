# C-292 Current Cycle Visibility

## Issue

The Journal HOT lane is active, but all visible rows are still stamped `C-291` while the Terminal header correctly shows `C-292`.

This makes the operator view look stale even though the HOT lane is working.

## Fix

The Journal chamber now makes the current cycle explicit even when there are no current-cycle rows yet.

Changes:

- Adds current-cycle count detection.
- Adds latest-entry-cycle detection.
- Shows a visible notice when current cycle has zero HOT entries but prior-cycle rows exist.
- Marks the current cycle tab with `· current`.
- Updates empty state copy to name the active cycle.

## Expected Behavior

If C-292 has zero entries but C-291 has rows, the Journal shows:

```txt
Current cycle active · C-292 has no HOT entries yet.
Showing latest available cycle C-291 until the next automation write.
```

This keeps the river visible without pretending the stale cycle is current.

## Next Fix

Patch the writer path that stamps cron journal entries so new automation writes use the current `currentCycleId()` value instead of stale digest/snapshot cycle.

## Canon

The HOT lane is active.
The current cycle must be visible.
Prior-cycle flow may be shown, but it must be labeled honestly.

We heal as we walk.
