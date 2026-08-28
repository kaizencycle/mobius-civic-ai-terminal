# EPICON_C-417_CODE_track-r-durable-review-artifacts_v1

**Cycle:** C-417
**Scope:** core
**Status:** published — non-executable intent
**Authority:** durable evidence-path repair only; `execution_authorized: false`

---

```intent
epicon_id: EPICON_C-417_CODE_track-r-durable-review-artifacts_v1
ledger_id: kaizencycle
scope: core
mode: normal
issued_at: 2026-08-28T13:00:00Z
expires_at: 2026-11-28T13:00:00Z

justification:
  VALUES INVOKED: Operator truth over illusion; fail-closed custodianship; provenance before execution.
  REASONING: C-412's EPICON_C-412_CORE_track-r-p3-intake-reconcile_v1 fixed production's ability to *observe* the current issued packet (32650057599), but the packet-review registry it reads from (docs/epicon/cycles/C-408/track-r-p3-review/packet-review-registry.json) has remained a permanent empty seed since C-408: runTrackRP3GovernanceIntakeCron.ts (the Vercel-cron-driven intake) writes only to KV (KvTrackRP3ReviewStateStore), and the referenced ZEUS/EVE machine-verification receipt artifacts (trackRP3ReviewArtifactPath) were never durably written anywhere -- not to the committed tree, not even fully as files in KV. Separately, the same intake path was flipping zeus_review_status/eve_review_status to the literal string 'intake_verified' -- sitting in the same enum as the terminal verdicts adopt/challenge/overturn -- once intake journals completed, which is exactly how a receipt gets misread as a review. This PR (a) stops that conflation at the source, (b) adds a resolver (trackRP3SelectedReview.ts) that reads ONLY the committed tree (no KV, no network) to answer "does a genuine, identity-bound, badge-valid verdict exist for lane X on the current packet" -- defaulting honestly to PENDING when it does not, and (c) adds a script + scheduled workflow (mirroring the existing publish-cycle-state.yml KV-to-git pattern) that deterministically re-derives the current packet's intake state from already-committed evidence and durably commits the registry entry and both lanes' machine-verification receipts. Exact packet binding for this repair: run 32650057599, packet_hash 82bfe16c7a13b3a8e73720debf50161c4a12da9e022e3682cb1d93276cfd96d9 (confirmed still current against the live issued-packet registry before this PR was opened; the earlier run 32264177719 remains correctly recorded as superseded).
  ANCHORS:
    - lib/watchdog/batchRepair/runTrackRP3GovernanceIntakeCron.ts (the intake-receipt/verdict conflation this closes)
    - lib/watchdog/batchRepair/trackRP3ReviewArtifacts.ts (trackRP3ReviewVerdictArtifactPath, validateTrackRIndependentReviewRecord -- existed but had no reader wired to it before this PR)
    - lib/watchdog/batchRepair/trackRP3SelectedReview.ts (new selected-source resolver)
    - scripts/track-r-p3-review-durability-sync.ts, .github/workflows/track-r-p3-review-durability-sync.yml (new durable sync)
    - .github/workflows/publish-cycle-state.yml (the established KV/live-state -> committed-file pattern this follows)
    - docs/epicon/cycles/C-412/EPICON_C-412_CORE_track-r-p3-intake-reconcile_v1.md (predecessor: fixed observation; this fixes durable evidence)
    - lib/agents/badge/validate.ts, governance/agents/{zeus,eve}.badge.json (reused for Badge validity/permission checks on a future verdict artifact)
  BOUNDARIES: Repairs the durable evidence path only. Writes zero verdicts -- zeus_review_status/eve_review_status remain awaiting_zeus/awaiting_eve for this packet after this PR merges, exactly as before, just now durably and correctly so. No Track R apply/batch-apply path touched. No Reserve Block, Fountain, MIC, cold-canon PR #419, or Cycle-pointer change. No production KV mutation (the new script/workflow read only the committed evidence tree and write only committed files).
  COUNTERFACTUAL: If a future PR adds real ZEUS/EVE verdict artifacts at the new sidecar path (trackRP3ReviewVerdictArtifactPath) that fail resolveTrackRP3SelectedReview's validation, that is the resolver correctly fail-closing, not a defect in this PR. If the live packet changes before this merges, the durability sync script exits 1 with PACKET_BINDING_CHANGED rather than silently retargeting.

counterfactuals:
  - If the durability sync workflow ever commits a verdict-shaped status for either lane, halt and revert -- it must only ever produce awaiting_zeus/awaiting_eve/PENDING for lanes with no validated artifact.
  - If a future artifact at the verdict sidecar path passes validation but both ZEUS and EVE resolve to a shared model_provenance/timestamp/evidence set, independence_status must read 'unverified' via assertReviewLanesAreIndependent -- if it does not, that is a regression to fix before trusting the pair.
  - Rollback is git revert of this PR's commits; no KV cleanup needed since nothing here writes to KV.
```

---

## Summary

Repairs the gap between Track R's runtime intake state (KV only) and its durable, committed review evidence for the current P3 packet (run `32650057599`, hash `82bfe16c...cfd96d9`). Fixes the intake-receipt/verdict field conflation at its source, adds a KV-free selected-source resolver with full fail-closed validation (identity binding, hash binding, Badge validity, artifact-hash integrity, cross-lane independence), and adds the durable KV-to-git sync mechanism that was missing entirely. Both ZEUS and EVE verdicts remain explicitly `PENDING` after this merges — this PR does not, and structurally cannot, issue a verdict on either agent's behalf.

## Rollback

```bash
git revert <commit-sha>
# No KV mutation performed by this PR's code paths — no KV cleanup needed.
```
