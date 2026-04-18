# Vault Seal I — Protocol (C-284 draft)

**Canon:** Reserve can be sealed before integrity unseals the Fountain.

**Rule:** Seal the tranche, not the history.

## Intent

Seal completed **50.00** reserve-unit tranches into immutable Vault v2 seal history. This does **not** imply Fountain activation, MIC payout, or erasing deposit history (`vault:deposits`, `balance_reserve`).

## Preconditions (reserve seal)

- `in_progress_balance >= 50` (v2) and no conflicting candidate, **or** deposit path forms candidate per v2.
- **Does not require** `GI >= 0.95` or sustain cycles — those gate **Fountain**, not the reserve tranche seal.

## State operators care about

| Field | Meaning |
|-------|--------|
| `sealed_reserve_total` | `seals_count` (attested) × 50 — frozen tranches only |
| `in_progress_balance` / `current_tranche_balance` | Forming next tranche (includes carry-forward) |
| `balance_reserve` | v1 cumulative (compatibility; not reset on seal) |
| `fountain_status` | `locked` until GI + sustain unseal path (lane model in API) |

## UI language

**Use:** Seal I achieved · Reserve tranche sealed · Fountain locked · Carry-forward to next tranche.

**Avoid:** “Vault unsealed” (ambiguous) · “Activated” for reserve alone · “Reserve reset”.

## Implementation notes

- Seal records and hashing: see `docs/protocols/vault-v2-sealed-reserve.md`.
- Operator-facing lane labels: `GET /api/vault/status` exposes `vault_headline`, `fountain_status`, `reserve_lane`, `sealed_reserve_total`, etc.
- Seal `cycle_at_seal` / vault cron: `resolveOperatorCycleId()` prefers ECHO/tripwire KV, else `currentCycleId()` (no stale hardcoded cycle).

---

*We heal as we walk.*
