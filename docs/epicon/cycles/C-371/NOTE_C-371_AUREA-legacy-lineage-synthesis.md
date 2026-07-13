# C-371 AUREA Synthesis — Legacy MIC Tranche Lineage Reconstruction

**Role:** AUREA (confirmed)  
**Recorded by:** ATLAS (Cursor agent)  
**Date:** 2026-07-13  
**Evidence:** PR #618, [`FINDINGS_C-371_legacy-mic-tranche-lineage.md`](./FINDINGS_C-371_legacy-mic-tranche-lineage.md)

---

## Confirmed reconstruction

PR #618 supports the corrected historical picture:

- **49/49** legacy MIC tranche seals exist in production KV
- All are **`promoted`**
- All pass **hash validation**
- Continuous chain **`seal-C-299-001` → `seal-C-307-041`** is intact (40/40 prev links)
- **C-307 block 41 → C-308 block 42** boundary already proven (PR #617)
- Earlier 404 result came from querying **IDs that never existed**

---

## Actual topology

### Pre-continuous MIC tranche era

`seal-C-288-001`, `seal-C-292-001`, … `seal-C-298-001` (registry list positions 1–8)

Each:

- `sequence: 1` (per-cycle parcel)
- `prev_seal_hash: null`
- Independent per-cycle genesis
- `promoted` in production KV

**Do not force-attach** these to the continuous chain — their null `prev_seal_hash` is intentional.

### Continuous Reserve sequence

```
seal-C-299-001 (reserve seq 1)
  → seal-C-300-002
  → …
  → seal-C-307-041 (reserve seq 41)
  → seal-C-308-042 (reserve seq 42)
  → …
  → seal-C-332-194
```

Two historical numbering models — not missing blocks 1–35:

1. **Per-cycle MIC tranche genesis** — several cycles each created their own sequence-1 parcel
2. **Continuous Reserve sequence** — begins at C-299 block 1; continues through block 194

---

## What C-370 got wrong

| Assumption | Reality |
|------------|---------|
| Historical ID = `seal-C-307-<block>` | **False** — cycle prefix changes per era |
| Chain population = attested only | **False** — promoted legacy seals excluded |

Correct lookup requires:

**authoritative legacy ID registry** + **all historically valid status classes** (`quarantined`, `promoted`, `attested`)

False orphan = **wrong ID addressing** + **status-filtered visibility**

---

## Canonical conclusion

**The Reserve history is not broken at C-308.**

| Span | Continuity |
|------|------------|
| C-299 seq 1 → C-307 seq 41 → C-308 seq 42 → C-332 seq 194 | **PROVEN** |
| Storage | **PRESENT** |
| Hash validity | **PROVEN** |
| Historical records rewritten | **NO** |

---

## Recommended status model

| Era | Label |
|-----|-------|
| C-288 → C-298 (registry pos 1–8) | `PRE_CONTINUOUS_MIC_TRANCHE_GENESIS_SET` |
| C-299 → C-307 (reserve seq 1–41) | `LEGACY_CONTINUOUS_MIC_TRANCHE_LINEAGE` |
| C-308 → C-332 (reserve seq 42–194) | `CONTINUOUS_RESERVE_LINEAGE` |
| C-307-041 → C-308-042 | `BOUNDARY_CONTINUITY_PROVEN` |

C-293 renamed the operator-facing unit from “tranche” to “Reserve Block” — same 50-MIC accounting object, evolved vocabulary.

---

## Remaining governance question

Not “Where are blocks 1–35?” but:

**How should Mobius canonically represent the transition from multiple per-cycle MIC tranche genesis seals into the single continuous Reserve Block lineage beginning at C-299?**

This is an **era-semantics decision**, not a chain repair.

---

*"We heal as we walk." — Mobius Systems*
