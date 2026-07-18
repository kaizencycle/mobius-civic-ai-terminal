# C-376 — Reserve Block Truth-Surface Reconciliation

**Cycle:** C-376  
**Type:** Fix  
**Primary Area(s):** apps / packages  
**Status:** OPEN — truth surface PR (does not disable `SEAL_INTEGRITY_GATE` or mutate production KV)

## Verdict (Michael diagnosis — validated in code)

The Reserve Block engine is **not dead**. MIC/deposit flow and accumulator advancement remain alive. The sealing boundary is **intentionally fail-closed** while hash-divergent `block_number_collisions` remain unreconciled (Track R).

The Terminal was presenting **Vault seal-index cardinality** as “Reserve Blocks sealed,” which is no longer truthful after the C-370/C-373 collision audit.

## Audit paths (8)

| # | Question | Finding |
|---|----------|---------|
| 1 | Where does “360 Reserve Blocks sealed” come from? | `lib/vault/lane-status.ts` — `computeVaultSealLaneSemantics` headline used `sealed_blocks` (= `floor(sealsCountAttested)`). |
| 2 | Where does “Sealed & attested: 360 blocks” come from? | `app/terminal/vault/VaultPageClient.tsx` — rendered `block.sealed_blocks` from `reserve_blocks_sealed ?? seals_count`. |
| 3 | Does `reserve_block_lane: block_ready` ignore the gate? | **Yes (before C-376).** Threshold check did not consult `SEAL_INTEGRITY_GATE`. Fixed: `integrity_hold` when gate active. |
| 4 | Can Block 361 reach 50 MIC while formation blocked? | **Yes.** `lib/vault-v2/deposit.ts` accrues `in_progress_balance`; gate blocks `formCandidate` only at threshold. |
| 5 | Does UI expose `hard_stop_enabled` / collision state? | **Partial before C-376.** `/api/vault/status` now exposes `reserve_block_truth`, `seal_integrity_gate`, `collision_pair_count`. |
| 6 | Why “Quarantined / audit: 0” with 125 collision pairs? | UI computed `audit_blocks - sealed_blocks` (index delta), **not** collision pairs. Collisions are duplicate `block_number` within attested seals. |
| 7 | Should “Pending attestation” say reconciliation pending? | Headline/operator summary now: *Deposits active · sealing suspended pending lineage reconciliation* when gate engaged. |
| 8 | Is block 361 `seals_count + 1`? | **Yes.** `computeReserveBlockSummary` — `in_progress_block = max(sealed, audit, v1) + 1`. Labeled as **projected** while gate engaged. |

## API additions (`GET /api/vault/status`)

- `reserve_block_truth` — structured truth surface
- `seal_integrity_gate` — gate state mirror
- `operator_summary` — one-line operator copy
- `collision_pair_count`, `canonical_reserve_blocks`, `canonical_lineage_status`, `formation_status`

## Explicit non-goals (this PR)

- Do **not** disable `SEAL_INTEGRITY_GATE`
- Do **not** apply Track R reconciliation receipts
- Do **not** rewrite sealed bodies or hand-edit `cycle.json`

## Operator copy (target)

```
Deposits active · sealing suspended pending lineage reconciliation

Vault seal records:       360
Attested seals examined:  319
Canonical Reserve Blocks: unresolved
Collision pairs:          125
Current accumulator:      26.52 / 50 MIC
Integrity gate:           ENGAGED
Latest canonical seal:    unresolved
```
