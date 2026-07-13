# VERIFICATION C-371 — ZEUS Full Reserve Lineage

**Agent:** ZEUS (cryptographic and adversarial continuity verifier)  
**Verified at:** 2026-07-13T15:18:22Z  
**Method:** Read-only production API + independent `computeSealHash` recompute  
**Script:** [`scripts/c371-zeus-verification.mjs`](../../../../scripts/c371-zeus-verification.mjs)  
**Artifact:** [`artifacts/C-371/zeus-verification.json`](../../../../artifacts/C-371/zeus-verification.json)

---

## ZEUS verdict

**`PASS_WITH_HISTORICAL_GENESIS_SET`**

All examined seal bodies have valid stored hashes. Predecessor links validate in walk order across the continuous legacy chain (positions 9–49), the C-307→C-308 boundary, and the full May-era attested fragment (sequence 42–194). Eight independent per-cycle genesis records (positions 1–8) are correctly classified with `prev_seal_hash == null`.

---

## Scope

| Layer | IDs / range | Count | Hash valid | Prev links |
|-------|-------------|------:|-----------|------------|
| Pre-continuous genesis set | `LEGACY_SEAL_KV_RESET_IDS` positions 1–8 | 8 | 8/8 | N/A (genesis) |
| Continuous legacy MIC tranche | positions 9–49 (`seal-C-299-001` → `seal-C-307-041`) | 41 | 41/41 | 40/40 continuous |
| Boundary | `seal-C-307-041` → `seal-C-308-042` | 2 | 2/2 | **proven** |
| Attested Reserve Block fragment | `seal-C-308-042` → `seal-C-332-194` | 153 | 153/153 | 152/152 continuous |
| **Total verified** | | **202** | **202/202** | **0 breaks** |

---

## Checks performed

1. Fetched complete seal body for every ID in `LEGACY_SEAL_KV_RESET_IDS` (49 entries).
2. Ran production `hash_valid` flag and independently recomputed `seal_hash` via canonical JSON (matches `lib/vault-v2/seal.ts`).
3. Confirmed field participation: `seal_id`, `sequence`, `cycle_at_seal`, `sealed_at`, `reserve`, `deposit_hashes`, `prev_seal_hash`.
4. Validated predecessor links on the **legacy list order** (positions 9–49) and on a **hash-chain walk** for the attested era (not sequence-sorted index sampling).
5. Distinguished link classes:

| Class | Count | Examples |
|-------|------:|---------|
| Valid genesis (`prev == null`) | 8 | `seal-C-288-001` … `seal-C-298-001` |
| Valid continuation | 192 | legacy pos 9–49 + era walk 42–194 |
| Boundary cross-status | 1 | promoted `seal-C-307-041` → attested `seal-C-308-042` |
| Hash mismatch | 0 | — |
| True missing predecessor (in verified set) | 0 | — |
| Duplicate sequence in continuous lineages | 0 | — |

6. Re-ran spot-check hashes in a fresh pass (`run2_spot_check`: 5/5 pass).
7. Confirmed all verified records carry `reserve == 50` MIC.

---

## Era classification (cryptographic)

| Era | Cycles | Topology | ZEUS classification |
|-----|--------|----------|---------------------|
| Pre-continuous genesis | C-288 → C-298 | 8 independent genesis seals at sequence 1 | `PASS_WITH_HISTORICAL_GENESIS_SET` |
| Legacy continuous MIC tranche | C-299 → C-307 | seq 1–41, `promoted`, unbroken prev chain | continuous |
| Reserve Block attested fragment | C-308 → C-332 | seq 42–194, `attested`, unbroken prev chain | continuous |
| Boundary 41→42 | C-307 / C-308 | cross-status link | **cryptographically proven** |

---

## Adversarial notes

- **Initial DISPUTED signal was a method artifact.** Sorting a partial attested index sample by `sequence` produced one false `prev` break (`seal-C-358-131` → `seal-C-326-157`) because 25 sequences in range 42–194 were absent from the API's 200-record audit page. Hash-chain walking from `seal-C-308-042` with cycle-aware successor discovery resolved the full 153-seal fragment with **zero** walk-order breaks.
- **June-era duplicate seals** (e.g. `seal-C-339-042` at block 42) coexist in KV but are **not** the May-era continuation chain verified here. ZEUS does not merge or select between duplicate `block_number` candidates; it verifies the chain that `seal-C-308-042.prev_seal_hash` actually references.
- **No records were mutated** during this verification.

---

## Hash implementation continuity

Recomputation uses the canonical tuple defined in `lib/vault-v2/seal.ts`. All 202 verified bodies match both the stored hash and the production API `hash_valid` flag. No historical implementation drift was detected for the examined set.

---

## Recommended review chain

| Agent | Seal |
|-------|------|
| ZEUS | ✅ Cryptographic — this document |
| ECHO | ⬜ Operational evidence — [`VERIFICATION_C-371_ECHO_storage-and-index-continuity.md`](./VERIFICATION_C-371_ECHO_storage-and-index-continuity.md) |
| JADE | ⬜ Semantic — [`VERIFICATION_C-371_JADE_reserve-semantic-continuity.md`](./VERIFICATION_C-371_JADE_reserve-semantic-continuity.md) |

*ZEUS does not mark lineage PASS on existence alone. Hashes and predecessor relationships independently validated.*
