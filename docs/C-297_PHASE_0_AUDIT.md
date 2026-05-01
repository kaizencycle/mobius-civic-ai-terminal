# C-297 Phase 0 — Mobius System Audit

## Summary
C-297 begins with a full-system audit across Terminal, Snapshot, Ledger, Agents, and Chambers.

This phase identifies structural risks, drift patterns, and integrity gaps.

---

## Key Findings

### 1. Ledger Chamber Regression
- LedgerPageClient was partially overwritten
- Missing controls, freshness banners, and footer
- Breaks operator auditability

### 2. Snapshot Fragility
- /api/terminal/snapshot timing out under load
- Slow lanes (echo, promotion) still impacting aggregate latency

### 3. Shell vs Snapshot Split
- Shell uses /api/terminal/shell
- Snapshot drives chambers
- Creates inconsistent first paint state (GI: —, C-—)

### 4. Hydration Drift Risk
- Shell poll interval = 30s
- Snapshot multi-lane fetch
- Potential divergence in perceived system truth

### 5. Conflict Detection Not Surfaced
- Phase 10 implemented backend
- No UI exposure yet in Ledger

---

## C-297 Roadmap (10 Phases)

### Phase 0 — Audit + Restore (THIS PR)
- Restore Ledger UI
- Document system issues

### Phase 1 — Snapshot Stabilization
- Reduce blocking lanes
- Introduce lane-level fallback rendering

### Phase 2 — Shell Alignment
- Sync shell + snapshot cycle + GI
- Remove "C-—" state where possible

### Phase 3 — Conflict UI Layer
- Add ConflictZonesPanel to Ledger

### Phase 4 — Promotion Lane Fix
- Resolve dedup ID reuse bug
- Cycle-scoped EPICON IDs

### Phase 5 — Agent Write Consistency
- Enforce write receipts across all agents

### Phase 6 — Replay Integrity
- Ensure replay does not mutate history

### Phase 7 — Tripwire Transparency
- Surface trust tripwire details in UI

### Phase 8 — Snapshot Decomposition
- Split snapshot into smaller composable endpoints

### Phase 9 — Operator Tooling
- Add debug overlays + traceability panels

### Phase 10 — Integrity Loop Closure
- Conflict → resolution → attestation pipeline

---

## Goal of C-297

Move Mobius from:
"Working system"

To:
"Self-correcting integrity system"

---

## Status

Phase 0: COMPLETE
Ready for review and merge
