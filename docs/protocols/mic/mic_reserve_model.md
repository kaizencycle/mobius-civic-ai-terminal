# MIC — Reserve model (Vault ↔ MIC)

**Status:** Runtime reference; aligns with Vault v2 and [vault-to-fountain-protocol.md](../vault-to-fountain-protocol.md).

---

## Objects

| Object | Meaning |
|--------|---------|
| **Journal** | Structured agent output; **not** money. |
| **Vault reserve units** | Accumulated from scored journal deposits; **non-spendable** proof-bearing reserve (`vault:deposits`, `balance_reserve` v1 compat, `in_progress_balance` v2). |
| **Tranche** | Default size **50** reserve units (`VAULT_RESERVE_PARCEL_UNITS` in code); eligible for **seal**, not automatically MIC. |
| **Seal** | Attested frozen tranche record (Vault v2 seal chain + audit index). |
| **Fountain** | **Release** gate for spendable flow; requires **GI + sustain** and related integrity conditions—not only reserve size. |
| **MIC (spendable)** | Wallet / ledger balance users or operators see when services are healthy; must not be conflated with raw reserve counters. |

---

## Flow (short)

```
Journal (claim) → Vault deposit (reserve units) → Tranche seal (attested) → … → Fountain unlock (integrity) → Controlled MIC / settlement flow
```

**Reserve can seal before the Fountain unseals.** That is constitutional: see [vault-seal-i.md](../vault-seal-i.md).

---

## Implementation pointers (this repo)

- `lib/vault/vault.ts` — deposits, `writeVaultDeposit`, `recordVaultDepositsForCouncil`.  
- `lib/vault-v2/deposit.ts`, `lib/vault-v2/seal.ts`, `lib/vault-v2/store.ts` — in-progress balance, candidates, seals.  
- `app/api/vault/status` — operator-facing `sealed_reserve_total`, `fountain_status`, `in_progress_balance`, etc.  
- `app/api/vault/contributions` — per-agent / per-cycle reserve from deposits.

---

## What not to claim in docs

- Do not equate **“reserve ≥ 50”** with **“MIC unlocked.”**  
- Do not describe **central bank integration** or **ROI** as current runtime truth for issuance.
