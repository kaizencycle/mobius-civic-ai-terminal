# C-300 Phase 8 — Ten Optimizations

## Scope
- Journal visibility fix (KV bridge)
- Substrate rejection diagnostics
- Signal normalization (HERMES / ZEUS)
- Cron cadence stabilization
- Replay pressure controls

## Key Changes

### 1. Journal KV Fallback
HOT lane now surfaces KV entries when substrate empty.

### 2. Substrate Rejection Logging
Writes ledger rejection body to KV: substrate:last_rejection

### 3. Agent Journal Cycle Integrity
Ensures last_journal + cycle always aligned.

### 4. HERMES µ1 Log Normalization
Replaces linear scaling with log scaling.

### 5. HERMES µ3/µ4 Live Signal
Adds HN Algolia + Federal Register fallback.

### 6. MIC Readiness Quorum Sync
Reads live quorum state instead of stale snapshot.

### 7. Promotion Cron
Adds /api/cron/promote-epicons every 5 min.

### 8. ECHO Dedup Upgrade
Switch to event-ID based dedup keys.

### 9. Replay Pressure Drain
Introduces drainReplayPressure utility.

### 10. ZEUS µ2 Source Fix
Replaces Semantic Scholar with OpenAlex.

## Expected Impact
- Journal lane no longer empty
- GI stability improves (~+0.02–0.03)
- Replay pressure decreases
- Substrate debugging unblocked

## Risk
LOW — additive changes only, no destructive mutations

## Next Phase
- Canon visibility layer
- Substrate attestation fix (post-debug)
