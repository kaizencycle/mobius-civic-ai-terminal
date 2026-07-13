# C-371 Custodian Q1 Disposition — C-307 → C-308 Boundary

**Filed by:** Michael Judan (custodian synthesis)  
**Recorded by:** ATLAS (Cursor agent)  
**Date:** 2026-07-13  
**Evidence:** [`FINDINGS_C-371_C307_predecessor-recovery.md`](./FINDINGS_C-371_C307_predecessor-recovery.md) (PR #617)

---

## Revised verdict — Q1 boundary (block 41 → 42)

| Question | Disposition |
|----------|-------------|
| Was `seal-C-308-042` orphaned at formation? | **NO** — false positive |
| Predecessor recovered? | **YES** — `seal-C-307-041` in production KV |
| Hash match? | **YES** — `2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758` |
| Historical continuity at boundary? | **PROVEN** |
| Cause of C-370 `orphan_prev`? | **Attested-only audit index** — predecessor is `promoted`, not `attested` |
| Historical mutation required? | **NO** |

**Status labels:**

- `HISTORICAL_CONTINUITY_PROVEN_AT_C307_C308_BOUNDARY`
- `EARLIER_PREDECESSOR_RANGE_PARTIALLY_UNAVAILABLE`

The chain must **not** be described as orphaned at C-308. C-308 block 42 did not initiate a new genesis and did not reference a nonexistent predecessor.

---

## Accurate diagnosis (replacing `ATTESTED_ORPHAN_FRAGMENT` for this boundary)

| Dimension | Status |
|-----------|--------|
| Cryptographic continuity | **PROVEN** |
| Storage continuity | **PRESENT** |
| Audit visibility | **INCOMPLETE** |
| Reason | Promoted legacy seals excluded from `vault:seals:index:attested` traversal |

---

## What remains open (Q1 scope narrowed, not closed)

| Item | Status |
|------|--------|
| Blocks `seal-C-307-001`..`035` | **404** in current KV — unavailable |
| Blocks `seal-C-307-036`..`041` | Present as `promoted` |
| Blocks `42`..`194` (May-era fragment) | Present and internally continuous |
| Full lineage to genesis | **Not proven** |
| Governance options (a/b/c) for era semantics | **Still require custodian selection** for the broader Q1 question |

This disposition closes the specific claim that C-308 block 42 is orphaned. It does not close the broader question of what happened to blocks 1–35 or how promoted vs attested populations should be governed going forward.

---

## Related next steps

1. Merge PR #617 (forensic evidence)
2. [`EPICON_C-371_PROPOSAL_lineage-audit-historical-index_v1.md`](./EPICON_C-371_PROPOSAL_lineage-audit-historical-index_v1.md) — audit index correction (separate ratification)
3. Optional backup search for blocks 1–35 — not blocking this boundary decision
