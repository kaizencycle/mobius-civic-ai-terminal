# C-409 Integrity and Track R Reconciliation

**Cycle:** C-409  
**Date:** 2026-08-20  
**Repository:** `kaizencycle/mobius-civic-ai-terminal`  
**Base:** `7b46d7f7137508981abca0cb26e7f991e3d07c72` (main at handoff)  
**Mode:** fail-closed diagnostic and observability repair — **no production mutation**

## Stop line (preserved)

This change set does **not**:

- set `execution_authorized` to `true`
- invoke `track-r:batch-apply` or production KV writes
- promote block 361, resolve boundary 131→132, append cold canon, or form a seal
- fabricate intake receipts or governance verdicts
- treat quorum receipt as governance agreement

## Root cause — degraded disagreement

Three surfaces used incompatible `degraded` semantics:

| Surface | Previous behavior |
|---|---|
| `/api/integrity-status` | Forced `degraded: true` whenever `RENDER_GIC_URL` was unset, independent of GI chain health |
| `/api/terminal/snapshot-lite` | Local composite ignored GIC availability, ZEUS dispute, and governance posture |
| `ledger/cycle-state.json` | Copied `snap.degraded` verbatim from snapshot-lite (10‑min publish lag amplified drift) |

**Result:** Green GI (`0.90`) with `snapshot-lite.degraded: false` while integrity-status and cycle-state reported `degraded: true`.

## Fix — single-source authority propagation

Added `lib/integrity/integrityAuthority.ts`:

1. Preserve explicit upstream `degraded: true`
2. Do not infer healthy from green GI alone
3. Surface cached/stale/disputed authority via ZEUS catalog + `gic_available`
4. Prevent presentation endpoints from weakening warnings

Both `/api/integrity-status` and `/api/terminal/snapshot-lite` now call `resolveIntegrityDegraded()` and emit a shared `authority` block:

```json
{
  "global_integrity": 0.9,
  "mode": "green",
  "degraded": true,
  "gi_provenance": "live-compute",
  "authority": {
    "kv_backed": true,
    "gi_origin": "kv",
    "degraded": true,
    "gic_available": false,
    "zeus_verification_status": "disputed",
    "note": "Render GIC indexer unavailable — authority remains degraded until configured."
  },
  "zeus_verification": {
    "path": "docs/catalog/zeus/2026-08-20T12-02-50Z-verification.json",
    "status": "disputed",
    "candidates_reviewed": 0
  },
  "quorum_semantics": {
    "seal_status": "receipt_quorum_only",
    "execution_authorized": false
  },
  "execution_authorized": false
}
```

## ZEUS dispute surfacing

`lib/integrity/zeusCatalog.ts` selects the chronologically latest catalog report (parses both dashed and compact filename formats). Latest on disk at handoff:

- `docs/catalog/zeus/2026-08-20T12-02-50Z-verification.json`
- `verification_status: disputed`
- Supersedes earlier C-409 confirmed report

Disputed ZEUS posture contributes to `degraded: true` and `decision_state.governance_state: disputed` even when numeric GI is green.

## Track R intake observability

**Route:** `GET /api/track-r/p3-intake-status?run_id=32264177719`

Read-only operator surface (`lib/trackR/p3IntakeObservability.ts`):

| Field | Canonical P3 candidate |
|---|---|
| `run_id` | `32264177719` |
| `packet_hash` | `271607643453b15a7a1170021fb2e7d4c3c0889de09b7acd12f04f35060e21f6` |
| `journal_id` | `10baa2c337a35da2ca327f3667c01005` |
| `production_commit` | `e054dd003320c1277e4520f67b64d03d8fdb49b2` |
| `execution_authorized` | `false` (always) |

Intake states exposed: `NOT_SEEN`, `INTAKE_VERIFIED`, `AWAITING_INDEPENDENT_REVIEW`, `REVIEW_IN_PROGRESS`, `BLOCKED`, `SUPERSEDED`.

Independent review records require exact packet binding via `validateTrackRIndependentReviewRecord()` — verdicts `ADOPT` / `CHALLENGE` / `OVERTURN` only; intake states are not verdicts.

Superseded run `32264049953` is blocked from satisfying current-run gates.

## Files changed

- `lib/integrity/integrityAuthority.ts` — shared degraded resolver + authority block
- `lib/integrity/zeusCatalog.ts` — latest ZEUS report selection
- `lib/integrity/buildIntegrityEnrichment.ts` — ZEUS governance into decision_state
- `app/api/integrity-status/route.ts` — unified degraded + ZEUS/quorum surfacing
- `app/api/terminal/snapshot-lite/route.ts` — unified degraded + authority block
- `lib/trackR/p3IntakeObservability.ts` — read-only intake builder
- `app/api/track-r/p3-intake-status/route.ts` — operator API
- `lib/watchdog/batchRepair/trackRP3ReviewArtifacts.ts` — independent review binding validator
- `tests/contract/c409IntegrityReconciliation.test.ts` — 12 contract tests
- `docs/ROUTE_MANIFEST.md` — regenerated

## Tests executed

```bash
pnpm exec tsx tests/contract/c409IntegrityReconciliation.test.ts  # 12/12 pass
pnpm exec tsc --noEmit                                              # pass
pnpm build                                                            # pass
node scripts/gen-route-manifest.mjs --check                           # pass
```

## Remaining governance blockers

- Durable runtime intake receipt not yet demonstrated in production KV
- ZEUS packet verdict absent (cycle synthesis ≠ Track R packet review)
- EVE packet verdict absent
- Human consent absent
- One-shot execution handoff absent
- `execution_authorized` remains `false`

## Post-merge operator sequence

1. Query `/api/terminal/snapshot-lite`, `/api/integrity-status`, and `ledger/cycle-state.json` — confirm `degraded` agreement
2. Query `/api/track-r/p3-intake-status?run_id=32264177719`
3. Capture durable intake receipt from KV when cron demonstrates it
4. Allow independent ZEUS/EVE packet-bound reviews
5. Obtain human consent only if governance requirements satisfied
6. Re-run Track R Execution Preflight — require Fresh CAS match + `awaiting_execution_handoff`
7. Do **not** execute batch apply until one-shot handoff is valid

**No production mutation occurred during this repair.**
