# C-305 — AUREA Runtime Truth Scan

## Live Runtime Findings

Snapshot source:
- Production terminal snapshot
- Cycle: C-305
- Commit: 1f59540a4337a38ecea2d22188766297ce342dbc

### Observed issues

1. CURRENT_CYCLE.md stale
- Repo still referenced C-301 while runtime already operates at C-305.
- Causes canon drift between operator docs and runtime truth.

2. Hidden substrate attestation failure
- Vault lane shows:
  `No API base configured for terminal`
- Seal continuity exists locally but substrate attestation continuity is degraded.

3. Journal mismatch
- journal lane reports `empty`
- snapshot simultaneously exposes live journal attestations in echo/ledger.
- Operator perception conflict.

4. Slow snapshot lanes
- epicon ≈ 852ms
- micReadiness ≈ 847ms
- signals ≈ 879ms
- kvHealth ≈ 879ms
- vault ≈ 681ms

5. Duplicate semantic reserve reporting
- reserve_block totals
- sealed_reserve_total
- balance_reserve_v1
- in_progress_balance
- tranche labels
- creates operator ambiguity.

6. Trust posture mismatch
- watchdog reports 2 failed checks
- trust tripwire shows nominal.
- likely threshold mismatch.

7. External governance source degraded
- Congress.gov returning 403.
- runtime currently reports watch-level degradation correctly.

8. Substrate visibility gap
- substrate.totalEntries = 0
- runtime otherwise healthy.
- substrate routing continuity unclear.

9. EPICON feed healthy but oversized
- snapshot payload extremely large.
- risk of future operator/mobile degradation.

10. Snapshot endpoint becoming monolithic
- too many nested payloads in one request.
- future scaling risk.

---

# 10 C-305 Optimizations

## Optimization 1 — Snapshot lane budgeting
Add explicit latency budgets per lane.

Suggested targets:
- integrity <150ms
- epicon <350ms
- vault <300ms
- micReadiness <250ms

Add budget breach flags to snapshot metadata.

---

## Optimization 2 — Substrate attestation visibility
Surface substrate attestation failures as:
- degraded
- warning
- stale

Never bury in nested vault JSON.

---

## Optimization 3 — Journal truth alignment
Align journal lane semantics:
- hot journal empty
- ledger attestations present

Add:
- journal_hot_count
- journal_archive_count
- attestations_visible

Prevent false-empty operator perception.

---

## Optimization 4 — Reserve canon normalization
Deprecate v1 balance display in operator UI.

Primary operator truth should be:
- sealed_blocks
- in_progress_block
- remaining_to_next_block

Keep v1 only for compatibility APIs.

---

## Optimization 5 — Watchdog/tripwire convergence
Merge:
- watchdog failed checks
- trust tripwire thresholds

into unified operator risk state.

Suggested states:
- nominal
- elevated
- degraded
- critical

---

## Optimization 6 — Snapshot-lite operator mode
Add lightweight operator snapshot mode:
- omit large ledger arrays
- omit historical MII arrays
- include summaries only

Useful for:
- mobile
- globe polling
- edge rendering

---

## Optimization 7 — EPICON pagination
Paginate large EPICON and ledger payloads.

Current snapshot payload is oversized.

Add:
- latest_only
- include_history=false
- max_entries

---

## Optimization 8 — Source degradation registry
Centralize external API degradation.

Current degraded signals:
- Congress.gov 403
- OpenLibrary fallback
- Semantic Scholar fallback

Should emit into one degradation registry.

---

## Optimization 9 — Consensus provenance badges
Add operator-visible provenance badges:
- live
- kv
- fallback
- cached
- substrate
- replayed

Currently partially implemented but inconsistent across lanes.

---

## Optimization 10 — Snapshot partitioning
Split snapshot internally into:
- runtime core
- governance
- vault
- signals
- ledger
- agents

Maintain one operator endpoint externally.

Improves:
- maintainability
- caching
- latency isolation
- degraded recovery.

---

# Suggested C-305 Phase Sequence

## Phase 1
- CURRENT_CYCLE alignment
- degradation visibility
- watchdog/tripwire alignment

## Phase 2
- snapshot-lite
- EPICON pagination
- reserve canon cleanup

## Phase 3
- substrate recovery
- attestation continuity
- lane partitioning

---

# Operator Conclusion

C-305 runtime is operational and coherent.

Primary weakness is no longer architecture.
Primary weakness is truth-density:
- too much nested runtime data
- partial semantic duplication
- degraded substrate continuity visibility.

The system now needs:
- clearer operator truth surfaces
- lighter snapshot contracts
- explicit degradation semantics
- attestation continuity hardening.
