# C-279 Closeout Optimization Runbook

## Purpose

This runbook captures the highest-value closeout work for C-279 **without** overriding the locked behaviors documented in `CURRENT_CYCLE.md`.

It is designed for operators and agents who need a single place to understand:
- what changed in C-279
- what is considered healthy vs expected-empty
- what to optimize next without breaking active circulation work

This document is intentionally operational, not aspirational.

---

## C-279 system read

Mobius now has three visible layers:

1. **Perception**
   - signals, heartbeats, watches, domain lanes
2. **Reflection**
   - agent journals are landing and surfacing reasoning
3. **Constitution**
   - repo law, build law, and cycle state now live in-repo

The remaining bottleneck is not raw capability.
It is **circulation**.

Mobius feels strongest when all of these happen in sequence:

```text
signal lands
→ KV stores it
→ Terminal shows it
→ agent synthesizes it
→ operator sees next action
```

---

## Closeout goals

A good C-279 closeout improves at least one of these:
- live state circulation
- journal visibility
- operator truth
- mobile chamber clarity
- event typing
- end-to-end confidence in the loop

A bad closeout:
- reopens locked key schemas
- rewrites expected-empty states as bugs
- adds surface area without proving circulation
- hides degraded state behind visual polish

---

## Ten closeout optimizations

### 1. Prefer shared-feed truth over agent-local state
Every completed EPICON write should be visible in the shared feed path the terminal reads.

Guardrail:
- do not bypass the locked `epicon:feed` bridge
- do not introduce parallel shadow keys for the same committed EPICON rows

### 2. Keep journal synthesis canonical
Every agent journal entry should preserve the same required fields and source semantics.

Required idea:
- observation
- inference
- recommendation
- confidence
- severity
- source
- agent origin

### 3. Surface newest synthesis in Pulse
Pulse should show the freshest journal summary, not just raw feed rows.
This turns Pulse into a decision surface instead of a scrolling log.

### 4. Preserve lane-specific degradation
Do not collapse the whole shell when only one lane is stale or empty.
Each lane should declare its own state explicitly.

### 5. Replace generic event labels aggressively
Avoid `UNKNOWN` when a better event type can be inferred.
Preferred types:
- HEARTBEAT
- WATCH
- CATALOG
- EPICON
- JOURNAL
- VERIFY
- PROMOTION
- SIGNAL

### 6. Keep mobile map / desktop globe split stable
World State should remain:
- **Map** on mobile for clarity
- **Globe** on desktop for presence

Do not let one renderer silently replace the other.

### 7. Keep console secondary on mobile
The command console should support the chamber, not dominate it.
Collapsed-by-default remains the correct mobile posture.

### 8. Make source counts legible in UI
Operators should be able to see how much state is arriving from:
- GitHub
- KV
- ledger API
- journals
- memory fallbacks

### 9. Prefer freshness over fake immediacy
If a lane is cached or stale, say so.
Do not create artificial timestamps or pretend a stale lane is live.

### 10. Run one end-to-end breathing test per cycle close
At least once per cycle, prove that a single synthetic or real test event can move through the full loop.

---

## What not to fix in this runbook

This runbook defers to `CURRENT_CYCLE.md` for anything marked:
- LOCKED
- EXPECTED EMPTY

If a task appears here and conflicts with those sections, `CURRENT_CYCLE.md` wins.

---

## Good operator questions at closeout

- Did a new signal land in a shared readable lane?
- Did at least one agent explain what it meant?
- Did the terminal make the next action clearer?
- Did we improve truth circulation without breaking architecture?

---

## Closeout doctrine

**C-279 is not about adding more intelligence.**
It is about making existing intelligence circulate more reliably.

One-line summary:

> Preserve the chamber. Preserve the truth. Close the circulation gap.
