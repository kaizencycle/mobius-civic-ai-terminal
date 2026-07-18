# C-376 — Reserve Block Truth-Surface Reconciliation

**Cycle:** C-376  
**Type:** Fix  
**Primary Area(s):** apps / packages  
**Status:** READY FOR PREFLIGHT — truth surface PR (does not disable `SEAL_INTEGRITY_GATE` or mutate production KV)

## Constitutional rule

**Canon → Ledger → UI**

```
canonical_reserve_blocks = records proven to belong to the reconciled canonical Reserve Block namespace
```

Not vault seal-index cardinality. Not `seals_count` when `SEAL_INTEGRITY_GATE` is off.

Gate state controls **formation permission**. Gate state does **not** adjudicate historical lineage.

## Witness table

| Claim | Verdict | Required evidence |
|-------|---------|-------------------|
| `seals_count` is Vault index cardinality | **TRUE** | `/api/vault/status` → `vault_index_records` |
| 360 equals canonical Reserve Blocks | **FALSE** | C-374/C-376 audits |
| Gate engaged blocks formation | **TRUE** | `getSealIntegrityGateState()` + `deposit.ts` |
| Deposits remain active | **TRUE** | Accumulator / `last_deposit` evidence |
| Gate off proves every seal canonical | **FALSE** | `resolveCanonicalReserveBlockCount()` requires evidence |
| Legacy tranche records are historical truth | **TRUE** | C-371 lineage evidence |
| Legacy tranche records are automatically modern Reserve Blocks | **FALSE** | Protocol-era distinction in `historical_era_breakdown` |
| Current projected slot is constitutionally block 361 | **UNVERIFIED** | Reconciliation pending |
| UI must render unresolved canon explicitly | **TRUE** | C-376 doctrine |

## Canonical count invariant (ATLAS preflight)

**Removed unsafe invariant:** gate-off must never imply `canonical_reserve_blocks = seals_count`.

**Correct model:** `canonical_reserve_blocks` resolves only from `CanonicalCountEvidence` (Track R). Without evidence: `null` + `canonical_count_status: unresolved`.

## Acceptance criteria

1. Truth surface separates Vault records from canonical blocks
2. Canonical count independent of integrity-gate state
3. Gate-off ≠ `seals_count` → canonical
4. Historical eras distinguishable (`historical_era_breakdown`)
5. Unknown counts explicitly unknown (`null`, not `0`)
6. Projected slot labeled operational, not canonical
7. Contract tests reflect these semantics
8. No production mutation · no gate disable
