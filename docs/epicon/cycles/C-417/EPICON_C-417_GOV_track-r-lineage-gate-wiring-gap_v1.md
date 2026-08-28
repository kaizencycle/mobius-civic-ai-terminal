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
  REASONING: Production logs (Vercel, 2026-08-28T13:25-13:55Z) show /api/cron/kv-watchdog reporting CRITICAL block_number_collisions (125 hash-divergent) and /api/cron/vault-attestation's seal-integrity gate blocking deposit-candidate formation as a result, twice in a 30-minute window. This is the live symptom of exactly the class of problem Track R's Capture #9 pipeline (docs/epicon/cycles/C-407/p3-preparation/runs/32650057599/*, made durably reviewable by JOB-17 / PR #704-#705) was built to fix. Tracing every reader of what Capture #9's staged batch-apply writes (watchdog:lineage:version:track-r-c403-batch-001:{manifest,canonical,quarantine} and watchdog:lineage:active_version) found none: not checkBlockCollisions, not sealIntegrityGate, not fetchAllSealedBlocks. Both the critical check and the gate read raw attested Seal records directly via listAllSeals(), which Capture #9's batch-apply never writes to or supersedes. So even a fully human-authorized execution of the currently-staged Capture #9 batch-apply would not clear this alert as the code is wired today. Separately, Capture #9's evidence (123 intended blocks, captured 2026-08-23 against commit 76f39ba5) does not numerically match the 125 collisions reported live on 2026-08-28, a drift this session could not independently verify or explain: outbound network access from this sandbox to mobius-civic-ai-terminal.vercel.app is denied at the proxy gateway level (CONNECT 403, "policy denial or upstream failure" per /__agentproxy/status), the same constraint documented earlier this cycle for the Substrate terminal. This EPICON records the finding and both open questions for human/ZEUS/EVE adjudication; it recommends nothing be executed and proposes no fix.
  ANCHORS:
    - Vercel production logs, mobius-civic-ai-terminal, 2026-08-28T13:25:00Z-13:55:00Z (user-supplied, pasted into this session)
    - lib/watchdog/kvHealthChecks.ts:239-268 (checkBlockCollisions — reads listAllSeals() directly)
    - lib/watchdog/sealIntegrityGate.ts (gate reads the same watchdog:kv:last-report / listAllSeals()-derived findings)
    - lib/dat/reserveBlockCollisions.ts:55-107 (analyzeReserveBlockCollisions — the actual collision detector, operates on raw Seal[])
    - lib/watchdog/batchRepair/versionedStaging.ts (writes watchdog:lineage:* — the only writer)
    - lib/watchdog/batchRepair/trackRP3GovernanceIntake.ts:28-33 (the only reader of watchdog:lineage:* keys, and only to verify its own write succeeded — not a behavioral consumer)
    - docs/epicon/cycles/C-407/p3-preparation/runs/32650057599/operator-packet.json (Capture #9: 123 intended_block_numbers, checked_out_commit 76f39ba5, capture_id track-r-c403-2026-08-15T2014Z)
    - mkdocs.yml announce banner: "C-397: Reserve Block collision reconciliation — preserve C-377 witness; cold canon draft pending Track R adjudication" (historical framing confirming this is Track R's intended scope)
  BOUNDARIES: This is a read-only finding. No code changed. No fix proposed or implemented. Does not authorize running Track R batch-apply, does not touch Reserve Blocks, does not mutate production KV, does not issue a verdict on Capture #9 (that remains ZEUS/EVE's independent call per JOB-18/JOB-19), does not advance the Cycle.
  COUNTERFACTUAL: If a future investigation gets live KV access (or the user supplies a fresh live collision dump), the 123-vs-125 drift question can be closed definitively; until then it is recorded as open, not resolved either way.

counterfactuals:
  - If someone runs Capture #9's batch-apply believing it will clear the current CRITICAL alert, that expectation is false per this finding — flag it before that happens, not after.
  - If a later PR wires checkBlockCollisions/sealIntegrityGate to also consult watchdog:lineage:*, re-verify this finding is actually obsoleted (not just believed to be) before treating the gate as fixed.
  - If the 123-vs-125 counts turn out to be explained by counting methodology rather than drift (e.g., collision_count vs unique colliding block_numbers are different denominators), correct this doc rather than leaving a false "drift" claim standing.
```

---

## Summary

Traces a live production alert (`kv-watchdog` CRITICAL, `block_number_collisions`, blocking Vault v2 deposit-candidate formation) back to Track R's existing Capture #9 remediation pipeline, and finds a wiring gap: **the fix Capture #9 stages would not clear this alert even if fully executed**, because the lineage canonicalization index it writes (`watchdog:lineage:*`) has no reader anywhere in the live collision-detection or gate-blocking code path — both operate on raw attested `Seal` records directly. Also flags an unreconciled count mismatch (123 staged vs. 125 live) that this session could not resolve due to a hard network-egress denial to the production terminal.

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
2. `checkBlockCollisions()` (`lib/watchdog/kvHealthChecks.ts:239`) calls that analyzer against `listAllSeals()` — the live raw seal store — and returns `critical` when any hash-divergent collision exists.
3. `sealIntegrityGate` (`lib/watchdog/sealIntegrityGate.ts`) reads the watchdog's own persisted report (or a stale critical-alert fallback) and blocks new deposit-candidate formation while any critical collision finding is active.

Both of these read **only** the raw seal store. Neither reads, nor has ever read, the lineage index.

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
| `scripts/track-r-live-dry-run-package.ts`, `tests/contract/batchCollisionRepair.test.ts` | Test/tooling references |

Nothing else. `checkBlockCollisions`, `sealIntegrityGate`, `fetchAllSealedBlocks`, `dedupeBlocksByNumber` — none of them consult this index. **Executing Capture #9's batch-apply today, fully authorized, would build a lineage classification that nothing downstream reads, and the CRITICAL alert plus the deposit-blocking gate would persist exactly as before.**

## The unresolved count mismatch

- Capture #9 (`operator-packet.json`): `intended_block_numbers` has **123** entries, range 1–131 (excluding 132 and 361 per the C-403 boundary rule), captured 2026-08-23T15:55:35Z against `checked_out_commit: 76f39ba5153caa367884af19eeb6a932dd557270`.
- Live watchdog report (2026-08-28, five days later): **125** hash-divergent collisions.

This session attempted to fetch live collision data to reconcile the two numbers and could not: `curl` to `mobius-civic-ai-terminal.vercel.app` from this sandbox returns `CONNECT tunnel failed, response 403`; `$HTTPS_PROXY/__agentproxy/status` confirms this is a gateway **policy** denial ("gateway answered 403 to CONNECT (policy denial or upstream failure)"), not a transient network fault. Whether the 2-collision difference reflects genuine drift since the capture, or a difference in counting methodology between the two numbers, is **not established** by this finding.

## What this finding does not do

It does not recommend a fix. Two directions are visible and neither is endorsed here:

1. Extend Track R's remediation to also write/supersede the raw `Seal` records the watchdog actually reads (so the fix and the check operate on the same data).
2. Wire `checkBlockCollisions`/`sealIntegrityGate` to also treat a quarantined-in-the-lineage-index duplicate as resolved (a design change with real implications — the "bad" raw seal record would remain in KV forever, silently overridden by an index layer, which is exactly the kind of thing `AGENTS.md`'s "operator truth over illusion" rule exists to be careful about).

Either path is a real design decision, not a mechanical fix, and belongs to whoever picks this up next — plausibly folded into JOB-18/JOB-19's independent ZEUS/EVE review of Capture #9 itself, since "does this packet's fix actually fix anything" is squarely inside that review's scope.

---

*"We heal as we walk."*
