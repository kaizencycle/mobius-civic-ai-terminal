# Q1 Evidence — Catalog History C-307→C-308 Boundary Correlates with Orphan Fragment

**Filed:** 2026-07-13  
**Source pointer:** [`docs/catalog/history/index.json`](../../../catalog/history/index.json) @ commit `80d2d16` (line ~1341)  
**Feeds:** [`GOVERNANCE_DECISION_C-370_chain-continuity.md`](./GOVERNANCE_DECISION_C-370_chain-continuity.md) Question 1  
**Status:** Evidence filed — governance decision still **OPEN** (does not pre-select option a/b/c)

---

## What the catalog entry shows

The catalog timeline at the cited index position records the **first calendar-catalog snapshot stamped C-308**:

| Field | Value |
|-------|-------|
| `generated_at` | `2026-05-11T07:51:45Z` |
| `cycle` | `C-308` |
| Prior entry | `2026-05-11T03:59:02Z`, cycle `C-307` |
| Snapshot file | [`docs/catalog/history/20260511T075145Z.json`](../../../catalog/history/20260511T075145Z.json) |

The immediately preceding C-307 entry is [`20260511T035902Z.json`](../../../catalog/history/20260511T035902Z.json) (`2026-05-11T03:59:02Z`).

**Note on catalog `cycle`:** `.github/workflows/catalog.yml` computes cycle from a calendar formula (`C-` + days since 2025-07-07 EST epoch). It is **not** the operator-cycle KV field. The correlation below is timestamp + naming alignment, not proof that catalog promotion caused the chain break.

---

## Correlation with KV audit orphan boundary

### 1. Timestamp lock with `seal-C-308-042`

| Event | Timestamp |
|-------|-----------|
| Dropped seal `seal-C-308-042` (block 42, `orphan_prev`) | `2026-05-11T07:51:02.451Z` |
| First catalog snapshot labeled C-308 | `2026-05-11T07:51:45Z` |
| Delta | **43 seconds** |

Block 42 is the **first sequence** in the orphan fragment (`lineage-seal-C-332-194`, seq 42–194, no genesis). It is also the first block in the collision checklist after the block-1–29 Chain C era (`MIC_RECONCILIATION_C-370_dropped-seals.md` row 30).

### 2. Seal-ID naming boundary at block 41 → 42

`app/api/cron/reattest-seals/route.ts` documents a hand-maintained legacy list (`LEGACY_SEAL_KV_RESET_IDS`, C-314 migration) spanning **v1 parcel IDs C-288 through C-307**, ending at:

```
seal-C-307-041   ← block 41, last legacy entry
```

The orphan fragment begins at **`seal-C-308-042`** — the first seal ID carrying cycle **C-308** in the block-42 position. Whatever `prev_seal_hash` block 42 expected (`2e03823c…`) is **absent from all 313 attested seals** in production KV.

### 3. Collision context at block 42

| | Kept (dedupe winner) | Dropped (orphan fragment) |
|---|----------------------|---------------------------|
| Seal ID | `seal-C-339-042` | `seal-C-308-042` |
| Cycle | C-339 | C-308 |
| Sealed at | `2026-06-12T00:55:34Z` | `2026-05-11T07:51:02Z` |

The May-era C-308 seal at block 42 was fully quorum-signed, then **superseded ~32 days later** by a June-era C-339 seal at the same `block_number`. The orphan fragment's internal `prev_seal_hash` chain still points backward to a predecessor that is no longer in the attested set — consistent with **loss or replacement of the seq 1–41 May-era lineage** while the seq 42–194 May-era chain remained partially in KV.

### 4. Blocks 30–41 gap in collision audit

The collision checklist jumps from block **29** (Chain C, Jul 2026) to block **42** (May 2026 orphan boundary). Blocks 30–41 have **no collision pairs** in the current 313-seal attested set — they appear only on Chain B (`seal-C-332-001` genesis, Jun 2026). That pattern fits:

- Original May-era seals for blocks 1–41 (through `seal-C-307-041`) are **not** among the 313 attested seals.
- Chain B re-sealed blocks 1–131 starting `2026-06-05` (`seal-C-332-001`).
- The orphan fragment (blocks 42–194, May-era C-308→C-332) survived in KV but **cannot link back** because its expected predecessor (likely block 41 / `seal-C-307-041` era) is gone.

---

## What this evidence supports (and does not)

### Supports

- The orphan fragment is **not random corruption** — it aligns with a **documented era boundary** (C-307→C-308 calendar day, legacy seal list terminus, first C-308 seal ID at block 42).
- The break is **upstream of block 42**: seq 1–41 May-era history is missing from attested KV, not merely on a parallel chain.
- A **later re-seal window** (Jun 5+ Chain B, Jun 12+ kept winners for blocks 42+) layered on top of the surviving May-era fragment without repairing hot `prev_seal_hash` linkage.

### Does not resolve (still requires custodian Q1 sign-off)

- Whether the seq 1–41 loss was **intentional** (documented migration / C-314 legacy reset), **accidental** (KV eviction, failed attestation, dedupe side-effect), or **never fully attested** to production KV.
- Whether the orphan fragment should remain in canon as a labeled unlinked segment (option b) or whether a custodian record exists explaining the C-307→C-308 vault transition (option a).
- Whether `seal-C-307-041`'s `seal_hash` equals `2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758` — **not verified in this note** (would require cold export, Substrate ledger, or pre-loss KV backup).

---

## Suggested follow-up (investigation only — not a recommendation)

1. Search Substrate ledger / cold `.dat` / GitHub catalog commits around `2026-05-10`–`2026-05-11` for `seal-C-307-041` or hash `2e03823c…`.
2. Review C-314 migration deploy logs for whether `LEGACY_SEAL_KV_RESET_IDS` processing touched seal bodies or only reattest backoff keys.
3. Custodian: mark Q1 option **(a)**, **(b)**, or **(c)** in [`GOVERNANCE_DECISION_C-370_chain-continuity.md`](./GOVERNANCE_DECISION_C-370_chain-continuity.md).

---

*Evidence filed per custodian catalog pointer. No governance option pre-selected.*
