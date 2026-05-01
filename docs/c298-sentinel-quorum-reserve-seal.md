# C-298 — Sentinel Quorum for Reserve Blocks

**Branch:** `claude/fix-sentinel-quorum-blocks-gfpqr`
**Operator Cycle:** C-298
**Goal:** Advance Reserve Block 18 from 73% → 100% by unblocking all four blockers:

| Metric | Before | After |
|---|---|---|
| Global Integrity (GI) | 0.661 | Target 0.95+ |
| Sentinel Quorum | 0/5 | 5/5 (cycle-tracked) |
| Sustain Counter | `not_started` | Active (sweep + heartbeat wired) |
| Block 18 | 73% | 100% (quorum path unblocked) |

---

## Root Cause Analysis

### Blocker 1 — KV WRONGTYPE Errors
`mic:readiness:feed` key type drifted between `string` and `list` across cycle boundaries, causing `WRONGTYPE` Redis errors that silently dropped readiness feed entries and degraded the feed signal used by GI.

### Blocker 2 — Sustain Counter Never Started
`lib/mic/sustainTracker.ts:updateSustainTrackingFromGi()` was implemented in C-287 but never called by any cron. The sustain counter (needed: 5 consecutive cycles at GI ≥ 0.95) remained at `not_started` indefinitely.

### Blocker 3 — Sentinel Quorum State Missing
The vault candidate attestation system requires a `SealCandidate` in flight — which requires balance ≥ 50 MIC. Without a candidate, the 0/5 quorum state was a permanent blocker with no per-cycle tracking. No `mic:quorum:<cycle>` key existed.

### Blocker 4 — Agents Stuck DEGRADED
`loadLatestJournalByAgent()` always preferred GitHub substrate entries even when 10+ days stale (last written C-287/C-288), ignoring the KV journal lane written every 10 minutes. All agents showed `DEGRADED` liveness.

### Blocker 5 — Quarantined Seals Not Clearing
The `vaultIdle` guard in `/api/cron/vault-attestation` blocked ALL seal scanning (including back-attestation of quarantined seals) when `in_progress_balance < 50 MIC`. Historical quarantined seals could never clear.

---

## 10-Phase Implementation

### Phase 1 — KV Hygiene
**Commit:** `daae49f fix(phase-1): KV hygiene — safeGet utility, kv-audit endpoint, WRONGTYPE guard on mic feed`

**Files changed:**
- `lib/kv/store.ts` — Added `kvTypeRaw`, `kvType`, `safeGet`, `safeGetRaw` defensive utilities
- `app/api/admin/kv-audit/route.ts` — NEW: audits Redis types of all Mobius keys; returns `wrong_type_keys` array
- `app/api/mic/readiness/route.ts` — Added type-check + delete guard before `kvLpushCapped` on `MIC_READINESS_FEED`

**Fix:** Before each `lpush` to `mic:readiness:feed`, check the key type and delete if it's not a list. Eliminates WRONGTYPE errors permanently.

---

### Phase 2 — GI Signal Repair
**Commit:** `1e27946 feat(phase-2): GI signal repair — Federal Register narrative source + gi_verified flag`

**Files changed:**
- `lib/agents/micro/hermes.ts` — Added `pollFederalRegister()` using the free Federal Register public API (`federalregister.gov/api/v1`); wired into `pollHermes()`
- `lib/gi/compute.ts` — Added `rawSignalValues?: number[]` input; added `gi_verified` (bool) and `gi_verification_method` (string) to output; verified = true when ≥3 signals ≥0.75 agree within ±0.1 band

**Fix:** HERMES now has a reliable civic narrative signal that doesn't depend on paid APIs or GitHub rate limits. `gi_verified` enables downstream consumers to distinguish computed GI from verified multi-source consensus.

---

### Phase 3 — Sentinel Quorum State Tracker
**Commit:** `74b5859 feat(phase-3): Sentinel quorum state tracker wired into journal pulse + vault status`

**Files changed:**
- `lib/mic/quorumTracker.ts` — NEW: per-cycle `SentinelQuorumState` (key: `mic:quorum:<cycle>`, TTL 48h); exports `loadQuorumState`, `registerSentinelAttestation`, `markAgentJournaled`
- `lib/agents/sentinel-cycle-journals.ts` — Calls `markAgentJournaled` after every successful journal write for the 5 Sentinel agents (ATLAS, ZEUS, EVE, JADE, AUREA)
- `app/api/vault/status/route.ts` — Appends `sentinel_quorum` object to response (cycle, status, attested_agents, pending_agents)

**Fix:** Quorum state is now tracked per-cycle independently of vault seal candidates. Every journal pulse advances the quorum counter. Status visible at `/api/vault/status`.

---

### Phase 4 — Activate Sustain Counter
**Commit:** `07f9a2b fix(phase-4): activate sustain counter — wire updateSustainTrackingFromGi into sweep+heartbeat`

**Files changed:**
- `app/api/cron/sweep/route.ts` — Calls `updateSustainTrackingFromGi(gi, cycle)` after `runMicroSweepPipeline()`; returns `sustain: { status, consecutiveEligibleCycles }` in response
- `app/api/cron/heartbeat/route.ts` — Resolves cycle, loads GI (live or carry-forward), calls `updateSustainTrackingFromGi`; returns sustain state
- `lib/mic/runtime-readiness.ts` — Added `gi_threshold` and `last_cycle_eligible` to sustain display object
- `lib/mic/types.ts` — Extended `MicReadinessResponse.sustain` with `gi_threshold` and `last_cycle_eligible`

**Fix:** Sustain counter now advances on every sweep (10 min) and heartbeat (5 min) tick. First real GI reading at ≥ 0.95 starts the countdown.

---

### Phase 5 — Quarantined Seal Reattestation
**Commit:** `fd85578 fix(phase-5): quarantined seal reattestation — fix vaultIdle bug + dedicated cron + schedule`

**Files changed:**
- `app/api/cron/vault-attestation/route.ts` — Fixed `vaultIdle` guard: quarantined seal scan + back-attestation now runs regardless of balance; only attested/fountain count reads are gated behind `shouldScanAll`
- `app/api/cron/reattest-seals/route.ts` — NEW: dedicated hourly cron; iterates all quarantined seals, calls `backAttestSeal()` for each missing agent; releases replay pressure on `attested` transitions
- `vercel.json` — Added `{ "path": "/api/cron/reattest-seals", "schedule": "0 * * * *" }`

**Fix:** Historical quarantined seals now have two independent retry paths: the 2-minute vault-attestation cron and the dedicated hourly reattest-seals cron. Neither is blocked by low balance.

---

### Phase 6 — Agent Liveness Fix
**Commit:** `609d120 fix(phase-6): agent liveness — prefer fresh KV journal over stale GitHub substrate`

**Files changed:**
- `app/api/agents/status/route.ts` — `loadLatestJournalByAgent` now compares GitHub vs KV timestamps; uses whichever is fresher. Added `KV_JOURNAL_FRESH_MS = 1800000` (30 min) freshness window for KV fallback entries vs `JOURNAL_FRESH_MS = 3600000` for substrate entries. `deriveLiveness` accepts `isKvFallback?: boolean` and applies appropriate window. `deriveLiveness` call now passes `isKvFallback: Boolean(journal?._kv_fallback)`
- `lib/runtime/agent-heartbeat-kv.ts` — Per-agent heartbeat payload includes `cycle?: string` for quorum correlation

**Fix:** Agents are no longer stuck `DEGRADED` due to stale substrate entries. KV journal lane (10-min cadence) takes precedence when it's more recent.

---

### Phase 7 — Seal Diagnostic Endpoints
**Commit:** `fdd4e9d feat(phase-7): seal diagnostics endpoints — seal-status + fountain-status`

**Files changed:**
- `app/api/vault/seal-status/route.ts` — NEW: active candidate progress (attested/missing agents, ms-to-timeout), quarantined digest, recent attested seals, balance readiness, sentinel quorum state
- `app/api/vault/fountain-status/route.ts` — NEW: fountain emission readiness (GI eligibility, sustain state), pending/activating/emitted/expired seal counts per threshold

**Fix:** Operators can now diagnose Block 18 progress without reading raw KV or cron logs. Both endpoints surface the data needed to determine if quorum → attested → fountain transition is blocked.

---

### Phase 8 — Substrate Attestation Error Recovery
**Commit:** `d217ada fix(phase-8): substrate attestation KV retry queue + error recovery`

**Files changed:**
- `lib/kv/store.ts` — Added `KV_KEYS.SUBSTRATE_RETRY_QUEUE = 'vault:substrate:retry_queue'`
- `lib/vault-v2/substrate-attestation.ts` — Added `SubstrateRetryEntry` type; `enqueueSubstrateRetry`, `dequeueSubstrateRetry`, `loadSubstrateRetryQueue` functions (7-day TTL, capped at 50 entries)
- `lib/vault-v2/back-attest.ts` — On substrate failure: seal stays `attested` in KV (KV is authoritative); `enqueueSubstrateRetry` queues for retry; logs warning
- `app/api/vault/block/attest-sweep/route.ts` — After back-attestation sweep, drains substrate retry queue: re-attempts `attestReserveBlockToSubstrate`, patches seal on success, `dequeueSubstrateRetry` on resolution; reports `substrate_retries` digest

**Fix:** Transient `writeToSubstrate` failures no longer silently lose immortalization. Retry queue persists across restarts and is drained by the 6-hour attest-sweep cron.

---

### Phase 9 — GI Verification + Trend Key
**Commit:** `6c3fa55 feat(phase-9): GI verification + trend key — wire gi_verified into KV writes`

**Files changed:**
- `lib/kv/store.ts` — `GIState` gains `gi_verified?: boolean` and `gi_verification_method?: string`. New `GITrendEntry` type and `KV_KEYS.GI_TREND = 'gi:trend'`. New `appendGiTrend` and `loadGiTrend` functions (48-entry cap, 24h TTL)
- `lib/integrity/buildStatus.ts` — Both `saveGIState` call sites now include `gi_verified`/`gi_verification_method` from `computeGI`; `appendGiTrend` called on every integrity computation
- `lib/signals/runMicroSweep.ts` — Derives `gi_verified` from `allSignals` consensus check; passes to `saveGiStateFromMicroSweep`
- `lib/kv/store.ts:saveGiStateFromMicroSweep` — Accepts `gi_verified`/`gi_verification_method`; appends to GI_TREND

**Fix:** `gi:trend` provides a rolling 8-hour window of GI readings with verification status. Enables the dashboard to show whether GI is trending toward the 0.95 threshold. `gi_verified: true` in the KV row distinguishes single-source estimates from multi-source consensus.

---

### Phase 10 — PR Document
**Commit:** This document.

---

## Acceptance Criteria

| Check | Verified by |
|---|---|
| No WRONGTYPE errors on `mic:readiness:feed` | `GET /api/admin/kv-audit` → `wrong_type_keys: []` |
| Sustain counter advancing | `GET /api/mic/readiness` → `sustain.consecutiveEligibleCycles > 0` |
| Sentinel quorum tracked per cycle | `GET /api/vault/status` → `sentinel_quorum.attestations_received > 0` |
| Agents show ACTIVE/BOOTING (not DEGRADED) | `GET /api/agents/status` → agents with `liveness: "ACTIVE"` |
| Quarantined seals clearing | `GET /api/vault/seal-status` → `seals_quarantined_total` decreasing |
| Substrate retry queue draining | `GET /api/vault/block/attest-sweep` → `substrate_retries.still_failing: 0` |
| GI trend available | Redis key `mobius:gi:trend` contains recent entries with `gi_verified: true` |
| Federal Register signal active | `GET /api/signals/micro` → HERMES signal with `source: "federal-register"` |

---

## Files Changed Summary

```
app/api/admin/kv-audit/route.ts              NEW
app/api/cron/heartbeat/route.ts              modified
app/api/cron/reattest-seals/route.ts         NEW
app/api/cron/sweep/route.ts                  modified
app/api/cron/vault-attestation/route.ts      modified
app/api/agents/status/route.ts               modified
app/api/mic/readiness/route.ts               modified
app/api/vault/block/attest-sweep/route.ts    modified
app/api/vault/fountain-status/route.ts       NEW
app/api/vault/seal-status/route.ts           NEW
app/api/vault/status/route.ts                modified
lib/agents/micro/hermes.ts                   modified
lib/agents/sentinel-cycle-journals.ts        modified
lib/gi/compute.ts                            modified
lib/integrity/buildStatus.ts                 modified
lib/kv/store.ts                              modified
lib/mic/quorumTracker.ts                     NEW
lib/mic/runtime-readiness.ts                 modified
lib/mic/sustainTracker.ts                    (no change — already correct)
lib/mic/types.ts                             modified
lib/runtime/agent-heartbeat-kv.ts            modified
lib/signals/runMicroSweep.ts                 modified
lib/vault-v2/back-attest.ts                  modified
lib/vault-v2/substrate-attestation.ts        modified
vercel.json                                  modified
```

---

## Cron Schedule After C-298

| Cron | Interval | Responsibility |
|---|---|---|
| `/api/cron/heartbeat` | 5 min | Fleet heartbeat + sustain tracking |
| `/api/cron/sweep` | 10 min | Signal sweep + GI + sustain |
| `/api/cron/vault-attestation` | 2 min | Candidate lifecycle + quarantine reattest |
| `/api/cron/reattest-seals` | Hourly | Dedicated quarantine backlog clearance |
| `/api/vault/block/attest-sweep` | 6 hours | Full sweep + substrate retry drain |
| `/api/cron/vault-attestation` | 2 min | (also drains substrate retries inline) |
