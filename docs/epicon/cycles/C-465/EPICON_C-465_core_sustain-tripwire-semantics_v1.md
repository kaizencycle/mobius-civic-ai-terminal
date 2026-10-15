# EPICON_C-465_core_sustain-tripwire-semantics_v1

**Cycle:** C-465
**Scope:** core
**Status:** published — non-executable intent
**Authority:** read-path fixes only; `execution_authorized: false`

---

```intent
epicon_id: EPICON_C-465_core_sustain-tripwire-semantics_v1
ledger_id: kaizencycle
scope: core
mode: normal
issued_at: 2026-10-15T00:00:00Z
expires_at: 2027-01-13T00:00:00Z

justification:
  VALUES INVOKED: Operator truth over illusion; metric humility; a category
    error is not an integrity event.
  REASONING: ATLAS's C-465 handoff traced 43 of 75 ZEUS disputes since C-442
    to two root causes rather than real integrity events. First, one field
    name, sustain_eligible, has answered two different questions depending
    on which producer emitted it: an instant GI-threshold reading from
    integrity-status, or a five-cycle gate from the vault status route.
    Second, runtime tripwire state lived only in one serverless instance's
    memory, so a cold instance's baseline could silently clobber a real,
    KV-persisted elevated tripwire on GET /api/tripwire/status. This PR adds
    explicit, honestly-nullable gate fields alongside the unchanged legacy
    field, and makes tripwire reads merge memory with KV, worst posture
    winning, removing the clobber write entirely.
  ANCHORS:
    - lib/mic/sustainTracker.ts (SUSTAIN_GI_THRESHOLD=0.75, SUSTAIN_REQUIRED_CYCLES=5, the one real KV-backed tracker)
    - lib/tripwire/store.ts (the module-level memory this PR adds readTripwireState()/mergeTripwireState() around)
    - app/api/tripwire/status/route.ts GET handler (the exact W7 clobber path this PR removes)
    - .github/scope-guard/protected-paths.txt (Tier-3 lib/integrity/ and lib/mic/ -- why this PR relocates new logic into lib/sustain/ instead)
  BOUNDARIES: Read-path fixes only. No GI computation, threshold, mint, or
    seal logic changes anywhere. lib/integrity/ and lib/mic/ are scope-guard
    Tier-3 paths this PR does not modify -- the equivalent behavior lives in
    a new lib/sustain/ module plus overlay logic applied at the (unprotected)
    route layer. One write is REMOVED (the tripwire GET clobber); no code in
    this PR adds a new write anywhere. LEVEL 4/5 anomaly correlation and
    GI-family coherence disputes are explicitly out of scope -- see the
    handoff's own section 7.
  COUNTERFACTUAL: If a reviewer finds any new code path writes to KV, or
    finds the legacy sustain_eligible field's value changed for any input,
    that falsifies the additive/read-path-only claim and this PR should be
    reverted. If lib/vault/lane-status.ts's computeVaultSealLaneSemantics is
    found to need its own sustain_met fix rather than the route-level
    override this PR applies, that is a Tier-3 follow-up for a human
    operator, not a reason to revert this PR.

counterfactuals:
  - If the external ATLAS/ZEUS sentinel prompts are never updated to read the new field names (see docs/sentinels/ZEUS_COMPARISON_MAP.md), ZEUS will keep disputing against the old field names and this PR's fix will not show up in the dispute count — that is an operator action outside this repo, not a defect in this PR.
  - If a future PR wants the sustain/tripwire fields centralized inside lib/integrity/ or lib/mic/ instead of the lib/sustain/ overlay, that is a Tier-3 edit only a human operator can make (scope-guard: agents may propose, never ship into those paths).
  - Rollback is git revert of this PR's commits — no KV mutation, no schema change, no migration to undo.
```

---

## Summary

Implements the C-465 "Sustain / Tripwire Semantic Divergence" ATLAS handoff.

- **Part A (sustain semantics)**: `/api/integrity-status`'s `decision_state` gains `gi_meets_sustain_threshold`, `sustain_eligible_semantics`, `sustain_gate_satisfied`, and `fountain_sustain_satisfied` — all additive; the legacy `sustain_eligible` field's value and meaning are unchanged. `/api/vault/status`'s `sustain_cycles_met` now reads the same shared `lib/sustain/readSustainGate.ts` reader instead of a hardcoded `false` literal discovered in `lib/vault/lane-status.ts`.
- **Part B (tripwire durability)**: `lib/tripwire/store.ts` gains `readTripwireState()`, a read-through merge of this process's in-memory reading and the KV-persisted record (worst posture wins), with honest `'memory' | 'kv' | 'merged' | 'baseline'` provenance. `GET /api/tripwire/status` no longer writes KV (the exact W7 clobber bug). The tripwire DAL (`lib/dal/tripwire.ts`) now reads KV instead of memory, so the parallel-read parity check is a real comparison instead of a tautology.

**Deviation from the handoff**: `lib/integrity/` and `lib/mic/` are Tier-3 ("operator-only") per `.github/scope-guard/protected-paths.txt`, despite being named in the handoff's own `scope:` list. This PR delivers equivalent behavior through a new `lib/sustain/` module and route-layer overlay logic instead of editing those two directories, and explicitly defers the one handoff item (`lib/integrity/buildStatus.ts`'s two GI-computation call sites) that would have required touching Tier-3 AND arguably GI computation itself. See the PR body's "Deviation from the handoff" section for the full accounting, including one additional real bug (`lib/vault/lane-status.ts`'s dead `sustain_met: false`) found and narrowly fixed along the way.

## Rollback

```bash
git revert <commit-sha>
# No KV writes were introduced by this PR (one write path was REMOVED).
```
