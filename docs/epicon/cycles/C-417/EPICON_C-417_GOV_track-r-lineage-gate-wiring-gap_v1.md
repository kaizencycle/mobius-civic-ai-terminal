# EPICON_C-417_GOV_track-r-lineage-gate-wiring-gap_v1

**Cycle:** C-417
**Scope:** docs (evidence-and-schema-proposal only)
**Status:** published — non-executable intent
**Authority:** finding only; `execution_authorized: false`

---

```intent
epicon_id: EPICON_C-417_GOV_track-r-lineage-gate-wiring-gap_v1
ledger_id: kaizencycle
scope: docs
mode: normal
issued_at: 2026-08-28T16:00:00Z
expires_at: 2026-11-28T16:00:00Z

justification:
  VALUES INVOKED: Operator truth over illusion; fail-closed custodianship; provenance before execution.
  REASONING: Production logs (Vercel, 2026-08-28T13:25-13:55Z) show /api/cron/kv-watchdog reporting CRITICAL block_number_collisions (125 hash-divergent) and /api/cron/vault-attestation's seal-integrity gate blocking deposit-candidate formation as a result, twice in a 30-minute window. This is the live symptom of exactly the class of problem Track R's Capture #9 pipeline (docs/epicon/cycles/C-407/p3-preparation/runs/32650057599/*, made durably reviewable by JOB-17 / PR #704-#705) was built to fix. Tracing every reader of what Capture #9's staged batch-apply writes (watchdog:lineage:version:track-r-c403-batch-001:{manifest,canonical,quarantine} and watchdog:lineage:active_version) found no consumer in the live collision-detection or gate-blocking path: not checkBlockCollisions, not sealIntegrityGate, not fetchAllSealedBlocks. checkBlockCollisions reads raw attested Seal records directly via listAllSeals(); sealIntegrityGate reads the persisted watchdog:kv:last-report finding that checkBlockCollisions writes — one layer downstream, but still nothing derived from Capture #9's lineage index. Capture #9's batch-apply never writes to or supersedes either data source. So even a fully human-authorized execution of the currently-staged Capture #9 batch-apply would not clear this alert as the code is wired today. Separately, Capture #9's evidence (123 intended blocks, captured 2026-08-23 against commit 76f39ba5) was initially read as conflicting with the 125 collisions reported live on 2026-08-28; re-reading this session's own already-fetched historical artifacts (artifacts/C-404/track-r-lineage-v2/history/capture-2014Z/TRACK_R_LIVE_DRY_RUN_REPORT.json and TRACK_R_AFFECTED_BLOCK_COMPARISON.json, both dated 2026-08-15) resolves this: 123 is the count of unique colliding block positions, 125 is the count of pairwise hash-divergent collisions among those positions (some positions have three colliding seals, contributing two pairs instead of one). Both artifacts record collision_pair_count_live: 125 as of 2026-08-15, matching the 2026-08-28 live figure exactly — so this is a stable, already-reconciled denominator difference, not drift. This EPICON records the wiring-gap finding for human/ZEUS/EVE adjudication; it recommends nothing be executed and proposes no fix.
  ANCHORS:
    - Vercel production logs, mobius-civic-ai-terminal, 2026-08-28T13:25:00Z-13:55:00Z (user-supplied, pasted into this session)
    - lib/watchdog/kvHealthChecks.ts:239-268 (checkBlockCollisions — reads listAllSeals() directly, persists result to watchdog:kv:last-report)
    - lib/watchdog/sealIntegrityGate.ts:98-119 (getSealIntegrityGateState — reads the persisted watchdog:kv:last-report / critical-alert KV keys, not raw seals directly)
    - lib/dat/reserveBlockCollisions.ts:55-107 (analyzeReserveBlockCollisions — the actual collision detector, operates on raw Seal[])
    - lib/watchdog/batchRepair/versionedStaging.ts (writes watchdog:lineage:* — the only writer)
    - lib/watchdog/batchRepair/trackRP3GovernanceIntake.ts:28-33 (reads the key names only, to verify its own write succeeded — not a behavioral consumer)
    - lib/watchdog/batchRepair/liveLineagePointerObservations.ts:31-55 and lib/watchdog/batchRepair/oneShotExecutionGuard.ts:62-83 (read watchdog:lineage:active_version, the pointer only — neither consumes the canonical/quarantine payloads, and neither sits in the collision-detection or gate-blocking path)
    - docs/epicon/cycles/C-407/p3-preparation/runs/32650057599/operator-packet.json (Capture #9: 123 intended_block_numbers, checked_out_commit 76f39ba5, capture_id track-r-c403-2026-08-15T2014Z)
    - artifacts/C-404/track-r-lineage-v2/history/capture-2014Z/TRACK_R_LIVE_DRY_RUN_REPORT.json (historical_hash_divergent_pair_count: 125, adjudicated_collision_positions: 123)
    - artifacts/C-404/track-r-lineage-v2/history/capture-2014Z/TRACK_R_AFFECTED_BLOCK_COMPARISON.json (set_match: true, pinned_contested_count: 123, collision_pair_count_live: 125, audited_at 2026-08-15T20:10:18.309Z)
    - mkdocs.yml announce banner: "C-397: Reserve Block collision reconciliation — preserve C-377 witness; cold canon draft pending Track R adjudication" (historical framing confirming this is Track R's intended scope)
  BOUNDARIES: This is a read-only finding. No code changed. No fix proposed or implemented. Does not authorize running Track R batch-apply, does not touch Reserve Blocks, does not mutate production KV, does not issue a verdict on Capture #9 (that remains ZEUS/EVE's independent call per JOB-18/JOB-19), does not advance the Cycle.
  COUNTERFACTUAL: The 123-vs-125 question is closed by this session's own already-fetched evidence (see ANCHORS) — no live KV access was needed. If a future audit finds the two historical artifacts disagree with a fresh live collision dump, that would be genuine drift and should be recorded as a new finding, not folded into this one.

counterfactuals:
  - If someone runs Capture #9's batch-apply believing it will clear the current CRITICAL alert, that expectation is false per this finding — flag it before that happens, not after.
  - If a later PR wires checkBlockCollisions/sealIntegrityGate to also consult watchdog:lineage:*, re-verify this finding is actually obsoleted (not just believed to be) before treating the gate as fixed.
  - If a fresh live collision dump ever disagrees with the 123-vs-125 reconciliation recorded here, treat that as new evidence of drift and correct this doc rather than assuming the earlier reconciliation still holds.
```

---

## Summary

Traces a live production alert (`kv-watchdog` CRITICAL, `block_number_collisions`, blocking Vault v2 deposit-candidate formation) back to Track R's existing Capture #9 remediation pipeline, and finds a wiring gap: **the fix Capture #9 stages would not clear this alert even if fully executed**, because the lineage canonicalization index it writes (`watchdog:lineage:*`) has no consumer anywhere in the live collision-detection or gate-blocking code path — the detection reads raw attested `Seal` records directly, and the gate reads a persisted finding derived from those same raw seals, one layer downstream. Also reconciles an apparent count mismatch (123 staged vs. 125 live): this session's own already-fetched historical evidence shows the two numbers are different denominators (unique colliding positions vs. total collision pairs), not drift — see "The reconciled count mismatch" below.

## What the live alert actually says

From Vercel production logs (user-supplied), `/api/cron/kv-watchdog`, twice within a 30-minute window on 2026-08-28:

```
[kv-watchdog] CRITICAL findings — custodian alert recorded
  cycle: C-417, checks: [latest_seal_key_freshness, block_number_collisions]
[vault-v2] deposit candidate formation blocked — seal integrity gate active
  reasons: ["125 hash-divergent block_number collision(s) in attested KV"]
```

Both occurrences reported the identical `125` figure, suggesting a stable (not actively growing, within that window) collision count — not, by itself, evidence of an active ongoing corruption event.

## How the detection and gate actually work (traced, not assumed)

1. `analyzeReserveBlockCollisions(seals)` (`lib/dat/reserveBlockCollisions.ts:55`) groups **raw attested `Seal` records** by `sequence` (the block number). Any `sequence` with ≥2 attested seals is a collision; `seal_hashes_differ: true` marks the dangerous subset — two genuinely different sealed payloads claiming the same slot.
2. `checkBlockCollisions()` (`lib/watchdog/kvHealthChecks.ts:239`) calls that analyzer against `listAllSeals()` — the live raw seal store — returns `critical` when any hash-divergent collision exists, and `runKvHealthChecks()` persists that result to the `watchdog:kv:last-report` KV key.
3. `sealIntegrityGate` (`lib/watchdog/sealIntegrityGate.ts:98-119`, `getSealIntegrityGateState()`) does **not** call `listAllSeals()` itself — it reads the persisted `watchdog:kv:last-report` key written by step 2 (falling back to a stale critical-alert marker), and blocks new deposit-candidate formation while that persisted finding is critical.

So detection reads the raw seal store directly; the gate is one layer downstream, reading a persisted finding derived from that same raw-seal analysis. Neither step reads, nor has ever read, the lineage index.

## What Capture #9 (Track R's staged fix) actually writes

Per `docs/epicon/cycles/C-407/p3-preparation/runs/32650057599/mutation-journal.json`, the staged `track_r_batch_apply_dry_run` for `repair_id: track-r-c403-batch-001` writes exactly four keys:

```
watchdog:lineage:version:track-r-c403-batch-001:manifest
watchdog:lineage:version:track-r-c403-batch-001:canonical
watchdog:lineage:version:track-r-c403-batch-001:quarantine
watchdog:lineage:active_version
```

This is a **canonicalization index** — for each colliding block, it records which seal Track R considers canonical (`pickPreferredSeal()`, `lib/dat/reserveBlockCollisions.ts:39` — highest quorum, then most recent, then highest seal_id) and which it quarantines. It does not delete, supersede, or otherwise mutate the raw `Seal` records themselves.

## The gap

Grepping every reference to `watchdog:lineage:` in the repository:

| File | Role |
|---|---|
| `lib/watchdog/batchRepair/versionedStaging.ts` | **Writer** — defines the keys, performs the CAS write |
| `lib/watchdog/batchRepair/trackRP3GovernanceIntake.ts:28-33` | Reads the key **names** only, to verify Track R's own write happened as expected during governance intake — not a behavioral consumer |
| `lib/watchdog/batchRepair/liveLineagePointerObservations.ts:31-55` | Reads `watchdog:lineage:active_version` (the pointer only, via `getWatchdogStringPrimaryOnly`) for observability reporting — does not read or consult the canonical/quarantine payloads |
| `lib/watchdog/batchRepair/oneShotExecutionGuard.ts:62-83` | Reads `watchdog:lineage:active_version` to reject a repeated activation attempt — a write-guard, not a collision-detection consumer |
| `scripts/track-r-live-dry-run-package.ts`, `tests/contract/batchCollisionRepair.test.ts` | Test/tooling references |

Two files besides the writer read `watchdog:lineage:active_version` (the pointer), but neither consumes the canonical/quarantine payloads and neither sits in the collision-detection or gate-blocking path. `checkBlockCollisions`, `sealIntegrityGate`, `fetchAllSealedBlocks`, `dedupeBlocksByNumber` — none of them consult this index, in any form. **Executing Capture #9's batch-apply today, fully authorized, would build a lineage classification that no collision-detection or gate code reads, and the CRITICAL alert plus the deposit-blocking gate would persist exactly as before.**

## The reconciled count mismatch

- Capture #9 (`operator-packet.json`): `intended_block_numbers` has **123** entries, range 1–131 (excluding 132 and 361 per the C-403 boundary rule), captured 2026-08-23T15:55:35Z against `checked_out_commit: 76f39ba5153caa367884af19eeb6a932dd557270`.
- Live watchdog report (2026-08-28): **125** hash-divergent collisions.

This looked like a 2-collision drift between capture and live, but this session's own already-fetched historical evidence resolves it as a denominator difference, not drift: `artifacts/C-404/track-r-lineage-v2/history/capture-2014Z/TRACK_R_LIVE_DRY_RUN_REPORT.json` records `adjudicated_collision_positions: 123` alongside `historical_hash_divergent_pair_count: 125`, and the companion `TRACK_R_AFFECTED_BLOCK_COMPARISON.json` (audited 2026-08-15T20:10:18.309Z) records `set_match: true`, `pinned_contested_count: 123`, and `collision_pair_count_live: 125`. 123 is the number of unique block positions with a collision; 125 is the number of pairwise hash-divergent collisions among those positions, which is larger whenever a position has three or more colliding seals (each extra seal on the same position adds another pair). Both artifacts already recorded `125` as of 2026-08-15 — the same figure the live logs show on 2026-08-28 — so this is a stable, previously-reconciled relationship, not new drift. No live KV access was needed to close this; it required only re-reading evidence this session had already fetched.

## What this finding does not do

It does not recommend a fix. Two directions are visible and neither is endorsed here:

1. Extend Track R's remediation to also write/supersede the raw `Seal` records the watchdog actually reads (so the fix and the check operate on the same data).
2. Wire `checkBlockCollisions`/`sealIntegrityGate` to also treat a quarantined-in-the-lineage-index duplicate as resolved (a design change with real implications — the "bad" raw seal record would remain in KV forever, silently overridden by an index layer, which is exactly the kind of thing `AGENTS.md`'s "operator truth over illusion" rule exists to be careful about).

Either path is a real design decision, not a mechanical fix, and belongs to whoever picks this up next — plausibly folded into JOB-18/JOB-19's independent ZEUS/EVE review of Capture #9 itself, since "does this packet's fix actually fix anything" is squarely inside that review's scope.

---

*"We heal as we walk."*
