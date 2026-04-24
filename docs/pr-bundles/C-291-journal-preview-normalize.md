# C-291 — Journal Preview Normalization

## Purpose

Clean up the Journal lane when Predictive Stabilization locks the UI to preview data.

## Problem

During elevated integrity drift, `useChamberHydration` can lock the Journal chamber to preview rows. The snapshot preview rows may contain partial fields like `title`, `summary`, `body`, or `message` instead of canonical journal fields like `observation` and `inference`.

That caused the UI to render cards with:

- `Observed: —`
- `Inferred: —`
- lowercase / inconsistent agent labels
- weak fallback source attribution

## Change

`hooks/useJournalChamber.ts` now normalizes preview rows before returning them to the Journal UI.

Normalization includes:

- agent resolution across `agentOrigin`, `agent`, `sourceAgent`, `author`, and `source`
- uppercase agent and agent origin
- observation fallback from `observation`, `summary`, `title`, `body`, then `message`
- inference fallback from `inference`, then `recommendation`, then a clear preview placeholder
- stable fallback id
- normalized status
- normalized severity
- normalized source
- default derivedFrom array

## Why this helps

The Journal lane now stays readable during preview/stabilization mode without pretending partial preview rows are fully canonical.

## Acceptance criteria

- [x] Preview rows no longer show blank observed/inferred fields when summary/title/body/message exists.
- [x] Agent labels are normalized before card rendering.
- [x] Tier scoping still applies before preview normalization.
- [x] Stabilization mode can keep using preview state safely.
