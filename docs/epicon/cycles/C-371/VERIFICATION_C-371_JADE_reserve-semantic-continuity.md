# VERIFICATION C-371 — JADE Reserve Semantic Continuity

**Agent:** JADE (historical-language and cycle-semantic verifier)  
**Verified at:** 2026-07-13T15:19:00Z  
**Method:** Canon document review + field-level implementation cross-check  
**Sources:** `docs/pr-bundles/C-293-reserve-blocks.md`, `docs/protocols/vault-v2-sealed-reserve.md`, `docs/protocols/mic/`, `app/api/cron/reattest-seals/route.ts`, C-370/C-371 EPICON notes

---

## JADE verdict

**`SEMANTIC_RENAME_WITH_COMPATIBILITY`**

Historical terms for the 50-MIC reserve unit refer to the same underlying accounting object across eras. The C-293 operator rename from **tranche** to **Reserve Block** changed presentation and added operator fields without altering the seal body's core semantics (`reserve: 50`, hash-chained `sequence`, `deposit_hashes`). Era transitions are reconcilable without forcing a false discontinuity claim.

---

## Term lineage table

| Term | First cycle (evidence) | Last cycle (evidence) | Source | Data fields | Same 50-MIC unit? | UI vs protocol |
|------|------------------------|----------------------|--------|-------------|-------------------|----------------|
| **tranche** | C-284+ (Vault v2 spec) | C-293+ (compat fields retained) | `docs/protocols/mic/mic_reserve_model.md` | `VAULT_RESERVE_PARCEL_UNITS`, `current_tranche_balance` | **Yes** | Protocol term |
| **MIC tranche** | C-288–C-307 (legacy IDs) | C-307 (`seal-C-307-041`) | `LEGACY_SEAL_KV_RESET_IDS`, C-371 findings | `reserve`, `sequence`, `seal_hash` | **Yes** | Historical operator label |
| **reserve tranche** | C-299+ continuous era | C-307 | C-371 legacy lineage doc | same seal body | **Yes** | Synonym in audit prose |
| **reserve parcel** | C-284 (Vault v2 §2) | present | `docs/protocols/vault-v2-sealed-reserve.md` | `in_progress_balance` → 50-unit parcel | **Yes** | Protocol term |
| **sealed reserve** | C-284 | present | Vault v2 sealed reserve protocol | `Seal` object | **Yes** | Protocol term |
| **Reserve Block** | C-293 (rename PR) | C-332+ attested era | `docs/pr-bundles/C-293-reserve-blocks.md` | `reserve_block*`, legacy `tranche*` kept | **Yes** | Operator rename + compat |

---

## Compatibility equation (C-293)

Per `docs/pr-bundles/C-293-reserve-blocks.md`:

```txt
legacy tranche fields retained
+ new Reserve Block operator fields added
= semantic rename with compatibility
```

**JADE confirmation:**

| Layer | Legacy retained | New added | Semantic change? |
|-------|-----------------|-----------|------------------|
| Seal body | `reserve`, `sequence`, `deposit_hashes`, `prev_seal_hash` | — | **No** |
| API compat | `current_tranche_balance`, `tranche_ready`, etc. | `reserve_block_*` fields | **No** (additive) |
| Operator UI | "tranche" copy | "Reserve Block" copy | **Yes** (presentation only) |
| Storage class | `promoted` (legacy reattest set) | `attested` (modern fragment) | **Status label**, not unit size |

---

## Era classification (semantic)

| Era | Cycles | Semantic model | JADE class |
|-----|--------|----------------|------------|
| **PRE_CONTINUOUS_MIC_TRANCHE_GENESIS_SET** | C-288 → C-298 | Independent per-cycle genesis seals at sequence 1; not one global chain | Documented discontinuity **by design** |
| **LEGACY_CONTINUOUS_MIC_TRANCHE_LINEAGE** | C-299 → C-307 | Single hash chain, sequence 1–41, `promoted` legacy registry | Continuous MIC tranche era |
| **CONTINUOUS_RESERVE_BLOCK_LINEAGE** | C-308 → C-332 | Same hash chain continues at sequence 42–194; operator term "Reserve Block" | Rename with compatibility |

**Transition C-307-041 → C-308-042:** Semantic era boundary (tranche → Reserve Block naming) coincides with a **cryptographically continuous** hash link (ZEUS proven). This is a **rename + status-class transition**, not a new genesis.

---

## Contradiction scan (Cycle notes / EPICONs)

| Source | Claim | Reconciled? |
|--------|-------|-------------|
| C-370 `orphan_prev` on `seal-C-308-042` | Predecessor absent | **Superseded** — attested-only index artifact (C-371 recovery) |
| C-370 "blocks 1–35 missing" | Storage loss | **Superseded** — wrong ID pattern (C-371 legacy audit) |
| C-293 "Block is not cosmetic" | Structural model | **Compatible** — describes accurate 50-unit parcel behavior already in Vault v2 |
| C-370 duplicate `block_number` rows (May vs June seals) | Two IDs per sequence | **Acknowledged** — parallel reattest era; does not change May-era chain semantics |
| `mic_genesis_block.md` | Fountain genesis (unimplemented) | **Orthogonal** — not the reserve seal chain genesis |

No unresolved canon contradiction blocks semantic continuity classification.

---

## 50-MIC accounting object identity

Across all verified eras:

- `reserve === 50` on every seal body examined (ZEUS: 202/202).
- `VAULT_RESERVE_PARCEL_UNITS` constant unchanged.
- `sequence` is the reserve-parcel ordinal within the continuous chain (not cycle number).
- Renamed concepts (tranche / Reserve Block) map to the same seal type in `lib/vault-v2/types.ts`.

---

## JADE does not claim

- Which duplicate `block_number` candidate is the active operational continuation (June reattest vs May era).
- That `promoted` vs `attested` status is semantically identical (status class differs; unit semantics do not).
- That Fountain / MIC spendable issuance is continuous (out of scope — reserve seal chain only).
