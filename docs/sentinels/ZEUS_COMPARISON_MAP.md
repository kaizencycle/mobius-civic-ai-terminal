# ZEUS Comparison Map — C-465

**Status:** reference only. This file documents *what ATLAS/ZEUS should compare*
against `/api/integrity-status` and `/api/vault/status`; it changes no code and
enforces nothing by itself. The external ATLAS/ZEUS sentinel prompts and
automations (not versioned in this repo — see W9 in the C-465 handoff) are the
thing that must actually be updated to use this map. **That update is outside
this repo and outside what this PR can do** — flagged as an operator action,
not a Claude Code deliverable.

---

## Why this exists

Since C-442, ZEUS has filed 75 `verification disputed` reports against 9
`confirmed`. 43 of 75 included a sustain or tripwire failure. The root cause
(C-465 RC-1/RC-2) was not an integrity event — it was ZEUS comparing two
fields that answer different questions, and reading tripwire state from a
source (per-instance memory) that isn't durable across serverless instances.

## Sustain

| ATLAS / ZEUS field | Compare against | NOT this |
|---|---|---|
| `sustain_eligible` (gate: 5 consecutive cycles) | `/api/integrity-status` → `decision_state.sustain_gate_satisfied` | **not** `decision_state.sustain_eligible` (that field answers "does GI clear 0.75 right now," unchanged since before C-442 — see `decision_state.sustain_eligible_semantics: 'instant_gi_threshold'`) |
| same gate, from the vault side | `/api/vault/status` → `sustain_gate_satisfied` (as of C-465; same shared reader as integrity-status's field above, so the two can never honestly disagree) | the legacy `sustain_cycles_met` field predates this reader and is kept only for backward compatibility |
| "is GI instantaneously above the sustain threshold" | `/api/integrity-status` → `decision_state.gi_meets_sustain_threshold` | this is NOT a gate and NOT evidence of 5 consecutive cycles — it is one instant's reading |

`sustain_gate_satisfied` and `fountain_sustain_satisfied` are `null`, never
`false`, when the underlying KV tracker (`MIC_SUSTAIN_STATE`) is unreadable.
Treat `null` as "unknown," not as "gate not met."

## Tripwire

| ATLAS / ZEUS field | Compare against | Notes |
|---|---|---|
| `tripwire.active` / `tripwire.level` | `/api/integrity-status` → `decision_state.tripwire_state` | as of C-465, this is read through a merge of this process's in-memory tripwire and the KV-persisted record — worst posture wins, so a cold instance's baseline can no longer mask a real, KV-persisted elevation (or vice versa) |
| — | `decision_state.tripwire_source` (new) | `'memory' \| 'kv' \| 'merged' \| 'baseline'`. `'baseline'` means **no evaluation has happened anywhere yet** — it is not the same as a confirmed clear. A dispute that fires only because `tripwire_source === 'baseline'` is disputing the absence of data, not a divergence. |
| — | `decision_state.tripwire_last_updated` (new) | timestamp of whichever reading won the merge |

## What this does not cover

- GI-family coherence (`gi_coherence`, `gi_alignment`, `mode_alignment`,
  `terminal_status`) — a separate job (C-406 GI provenance), out of scope here.
- LEVEL 4/5 anomaly correlation, feed failures (Congress.gov 403, usgs-water,
  govtrack, cloudflare-radar) — unrelated to this map.
- Disputes with zero failed checks (ZEUS appears to dispute on warns alone in
  some cases) — a separate ZEUS-prompt issue.

## Operator action required (not done by this PR)

Update the external ATLAS and ZEUS sentinel prompts/automations (wherever they
live — not in this repository; see W9) to read the fields on the right-hand
side of the tables above instead of the fields they have been comparing. Until
that update happens, this PR changes what the Terminal *reports*; it does not
by itself stop ZEUS from filing the same category-error disputes against the
old field names.
