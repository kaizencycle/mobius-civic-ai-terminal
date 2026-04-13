# C-279 Breathing Test

## Purpose

This runbook defines the minimum proof that Mobius is not only observing, but **circulating**.

A breathing test proves that a signal can move through the system and become:
- visible
- interpretable
- actionable

This is the fastest operator check for whether the stack is truly alive.

---

## Definition

A breathing test passes when a single event can complete the following loop:

```text
signal lands
→ KV stores it
→ terminal surfaces it
→ agent writes synthesis
→ operator sees next action
```

A stronger version also includes:

```text
→ ledger candidate appears
→ verification or promotion state updates
```

---

## Why this matters

Mobius can look alive while still being partially disconnected.

Examples:
- agents writing to the wrong KV keys
- journal rows existing in storage but not surfacing in UI
- terminal rendering fallback shell instead of lane truth
- Pulse showing feed rows without explanation

The breathing test is the shortest path to catching this.

---

## Test inputs

A breathing test may use:
- one real low-risk signal
- one synthetic internal test signal
- one manually triggered ingest event

Prefer a test that is:
- non-destructive
- clearly typed
- easy to identify in logs and UI

Example labels:
- `mobius-breathing-test`
- `c279-test-event`
- `journal-loop-test`

---

## Required checkpoints

### 1. Signal landing
Confirm the event exists in the originating lane.

Examples:
- ingest route response
- internal state object
- source-specific API row

### 2. KV storage
Confirm the event lands in the **shared readable key**, not only in agent-local state.

Examples:
- `epicon:feed`
- current journal key schema documented in `CURRENT_CYCLE.md`

### 3. Terminal visibility
Confirm the event appears in at least one of:
- `/api/terminal/snapshot`
- `/api/epicon/feed`
- `/api/agents/journal`
- visible terminal chamber UI

### 4. Agent synthesis
Confirm one agent writes a journal entry with:
- observation
- inference
- recommendation
- source
- agent origin

### 5. Operator clarity
Confirm the visible result makes the next action clearer.
If the system surfaces the event but leaves the operator confused, the test is incomplete.

---

## Pass criteria

A breathing test is a **pass** if all of the following are true:

- event is stored in a shared readable lane
- terminal or API surface shows it
- journal entry exists for it
- journal entry is not empty prose
- operator can describe the next recommended action

---

## Failure modes

### Failure mode A — local-only write
The signal exists in agent-specific state but never reaches the shared feed.

### Failure mode B — read path break
The signal exists in KV or substrate, but the reader route returns zero.

### Failure mode C — reflection gap
The signal appears, but no journal synthesis is written.

### Failure mode D — visibility gap
The APIs are correct, but chamber UI still looks dead or fallback-heavy.

### Failure mode E — action gap
The system reports the issue, but does not help the operator know what to do next.

---

## Operator checklist

Use this checklist once per cycle close.

- [ ] Trigger or identify one breathing-test event
- [ ] Confirm shared KV or journal write path
- [ ] Check `/api/epicon/feed`
- [ ] Check `/api/agents/journal`
- [ ] Check `/api/terminal/snapshot`
- [ ] Confirm one chamber shows the event
- [ ] Confirm one journal explains it
- [ ] Confirm next action is legible

---

## Reporting template

```md
### Breathing Test
- Event: ...
- Signal landed: yes/no
- Shared KV visible: yes/no
- Journal visible: yes/no
- Terminal visible: yes/no
- Operator next action clear: yes/no
- Result: pass/fail
- Notes: ...
```

---

## Doctrine

The breathing test is not a vanity demo.
It is the minimum proof that Mobius can:
- perceive
- reflect
- communicate

One-line summary:

> If Mobius cannot circulate one event end-to-end, it is not breathing yet.
