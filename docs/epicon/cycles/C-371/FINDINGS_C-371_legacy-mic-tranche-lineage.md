# C-371 Findings — Legacy MIC Tranche / Sealed-Reserve Lineage (Blocks 1–41)

**Cycle:** C-371  
**Task:** Corrected enumeration of blocks 1–41 using `LEGACY_SEAL_KV_RESET_IDS`  
**Investigator:** ATLAS (Cursor agent)  
**Date:** 2026-07-13  
**Manifest:** [`artifacts/C-371/legacy-mic-tranche-lineage-manifest.json`](../../../../artifacts/C-371/legacy-mic-tranche-lineage-manifest.json)  
**Amends:** [`FINDINGS_C-371_C307_predecessor-recovery.md`](./FINDINGS_C-371_C307_predecessor-recovery.md) § blocks 1–35 unavailable

---

## Executive summary

The prior claim that **blocks 1–35 are not found in production KV** was caused by querying **nonexistent seal IDs** (`seal-C-307-001` through `seal-C-307-035`). Early-era reserve parcels used **changing cycle prefixes** per block; the authoritative ID list is `LEGACY_SEAL_KV_RESET_IDS` in `app/api/cron/reattest-seals/route.ts`.

Using that list:

| Finding | Result |
|---------|--------|
| Legacy registry entries (`LEGACY_SEAL_KV_RESET_IDS`) in production KV | **49/49 present** (`status: promoted`) |
| `hash_valid` on all | **true** |
| Continuous `sequence` 1→41 chain (`seal-C-299-001` … `seal-C-307-041`) | **40/40 prev links intact** |
| Boundary 41→42 (`seal-C-307-041` → `seal-C-308-042`) | **proven** (prior C-371 task) |
| Wrong-ID probe `seal-C-307-00N` | **35/35 → 404** (expected — IDs never existed) |

**Revised status:** `LEGACY_MIC_TRANCHE_LINEAGE_RECOVERED_IN_KV`

The history was not missing from KV. It was **mis-addressed** by modern cycle-prefix assumptions and **invisible** to attested-only audits.

---

## 1. Why the earlier search failed

C-371 predecessor recovery (PR #617) surveyed `seal-C-307-{001..035}` because block 41 lives in cycle C-307. That pattern assumes a uniform `C-307` prefix for all sequence slots — **false for the MIC tranche era**.

Early evolution (pre–C-293 “Reserve Block” rename):

- 50-MIC **tranche / reserve parcel** accumulated deposits
- Seal candidate formed per cycle
- Multiple cycles each produced their own `…-001` genesis before continuous sequence numbering stabilized at `seal-C-299-001`

**Example mapping (registry list position vs reserve sequence):**

| List pos | Reserve seq | Seal ID | Notes |
|----------|-------------|---------|-------|
| 1 | — | `seal-C-288-001` | Pre-continuous genesis; also in Substrate archive |
| 2 | — | `seal-C-292-001` | Pre-continuous genesis (`prev_seal_hash: null`) |
| … | — | … | Positions 3–8: same pattern |
| 9 | 1 | `seal-C-299-001` | Start of **continuous** sequence 1→41 |
| 10 | 2 | `seal-C-300-002` | Links to C-299-001 |
| … | … | … | |
| 49 | 41 | `seal-C-307-041` | Registry terminus; `sequence: 41` |
| — | 42 | `seal-C-308-042` | **Not** in `LEGACY_SEAL_KV_RESET_IDS`; `status: attested` |

---

## 2. Surfaces checked (blocks 1–41 legacy IDs)

| Surface | Blocks found | Notes |
|---------|--------------|-------|
| Production KV (`GET /api/vault/seal/{id}`) | **49/49** | All `promoted`; all `hash_valid: true` |
| `Mobius-Substrate/seals/` | **1/49** | `seal-C-288-001.json` only |
| `Mobius-Substrate/data/seal-reconciliation/` | **1/49** | `seal-C-288-001.json` (quarantined reconciliation state) |
| `mobius-civic-ai-terminal/data/seals/` | **1/49** | `seal-C-288-001.json` fixture |
| CPC `ledger/reserve-block-index.json` | **0** | Empty index |
| Wrong pattern `seal-C-307-00N` | **0/35** | All 404 |

---

## 3. Chain topology (revised)

### Pre-continuous era (legacy list positions 1–8)

Eight cycle-genesis seals (`seal-C-288-001` … `seal-C-298-001`). Each has `sequence: 1`, `prev_seal_hash: null`. They are **not** prev-linked to each other — parallel era starters under the early per-cycle numbering model.

`seal-C-288-001` additionally survives in Substrate archive as `quarantined` (timeout attestations). Production KV holds the same seal as `promoted` — status vocabulary differs by storage class, not duplicate bodies.

### Continuous reserve sequence (sequence 1–41)

```
seal-C-299-001 (seq 1, genesis)
  → seal-C-300-002 (seq 2)
  → … 
  → seal-C-307-041 (seq 41)
  → seal-C-308-042 (seq 42, attested)
  → … → seal-C-332-194
```

**40/40** internal `prev_seal_hash` links verified within `seal-C-299-001` … `seal-C-307-041`.

### Full proven span (present KV)

| Segment | Status |
|---------|--------|
| `seal-C-299-001` → `seal-C-307-041` | **Cryptographically continuous** (promoted) |
| `seal-C-307-041` → `seal-C-308-042` | **Cryptographically continuous** (promoted → attested) |
| `seal-C-308-042` → `seal-C-332-194` | **Internally continuous** (attested orphan fragment) |

---

## 4. Status vocabulary across storage classes

| Status | Where observed | Audit lens |
|--------|----------------|------------|
| `quarantined` | Substrate `seals/seal-C-288-001.json` | Excluded from attested + promoted KV queries |
| `promoted` | Production KV (all 49 legacy IDs) | Excluded from attested-only lineage walk |
| `attested` | `seal-C-308-042` onward (modern fragment) | Included in C-370 audit |

An audit that queries only `attested` **or** assumes uniform `seal-C-307-NNN` addressing will produce false orphans or false absences.

---

## 5. What remains unresolved

| Item | Status |
|------|--------|
| Whether pre-continuous genesis seals (positions 1–8) should link to each other historically | **Unproven** — each is `prev: null` by design of per-cycle era |
| Substrate archive for blocks 2–41 | **Not present** in repo (only block 1) |
| Operational semantics of `promoted` vs `attested` | Governance / index correction ([`EPICON_C-371_PROPOSAL_lineage-audit-historical-index_v1.md`](./EPICON_C-371_PROPOSAL_lineage-audit-historical-index_v1.md)) |
| Q1 governance option (a/b/c) for era treatment | **Custodian** — forensic evidence now substantially richer |

---

## 6. Corrected statements

| Prior statement | Correction |
|-----------------|------------|
| “Blocks 1–35 not found in KV” | **False** under wrong ID pattern; **49/49 legacy IDs present** as `promoted` |
| “Proven chain begins at block 36” | **False**; continuous sequence chain begins at **`seal-C-299-001` (seq 1)** |
| “Blocks 1–35 never existed” | **Not supported**; bodies exist under legacy IDs |
| `ATTESTED_ORPHAN_FRAGMENT` at C-308 | **False positive** (attested-only index) — already dispositioned |

---

## 7. Explicit non-actions

No seal mutation, pointer repair, status changes, or governance option selection.

---

**No historical data was rewritten during this investigation.**
