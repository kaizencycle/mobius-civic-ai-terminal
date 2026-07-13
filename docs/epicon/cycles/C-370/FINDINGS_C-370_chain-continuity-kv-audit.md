# C-370 Findings — Production KV Chain Continuity Audit

**Date:** 2026-07-13T00:00 UTC  
**Operator cycle:** C-370  
**Source:** GitHub Actions — [Audit Reserve Block Lineage](https://github.com/kaizencycle/mobius-civic-ai-terminal/actions/workflows/audit-reserve-block-lineage.yml) (workflow_dispatch on `main` @ `194cfdb3`)  
**Artifact:** `reserve-block-audit` (`lineage-audit.json`, `collision-audit.json`)  
**Severity:** **P0** — `multiple_lineages: true`, `hash_divergent_collisions: 119`, `alert: true`

---

## Executive summary

Production KV audit **confirms** the chain-continuity concern is real and **more severe** than the initial Canon Browser observation:

1. **Three hot-KV lineage structures**, not two — including an orphan fragment with no genesis and a broken `prev_seal_hash` link.
2. **119 block_number collisions**, every one **hash-divergent** — not retry/resend noise.
3. **Every collision pair was fully quorum-signed on both sides** (`kept_quorum: 5`, `dropped_quorum: 5`) at different times, often weeks apart.

This is **not** a Canon Browser display artifact. Cold export dedupe-by-`block_number` cannot reconcile two independent hot histories without a documented governance decision.

**Required next step:** Human custodian / seal-quorum authority must answer whether the C-359 restart and orphan fragment were **documented and intentional** — not an agent-authored fix.

---

## Lineage audit (`lineage-audit.json`)

| Field | Value |
|-------|-------|
| `operator_cycle` | C-370 |
| `audited_at` | 2026-07-13T00:00:13.610Z |
| `attested_count` | 313 |
| `hash_valid_count` | 313 |
| `hash_invalid_count` | 0 |
| `genesis_count` | 2 |
| `multiple_lineages` | **true** |
| `link_issues` | 1 (`orphan_prev`) |
| `reattest_clusters` | 1 |

### Lineage components (3)

#### Component 1 — Orphan fragment (`lineage-seal-C-332-194`)

| Field | Value |
|-------|-------|
| Genesis seals | **none** |
| Tip | `seal-C-332-194` |
| Seal count | 153 |
| Sequence range | 42–194 |
| Cycles | C-308 → C-332 |
| Fountain | `activating` |

**Link issue:** `seal-C-308-042` (sequence 42) has `prev_seal_hash` = `2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758` — **not found** among any attested seal. Whatever this chain was supposed to link back to no longer exists in the attested set.

#### Component 2 — Chain B (`lineage-seal-C-332-001`)

| Field | Value |
|-------|-------|
| Genesis | `seal-C-332-001` |
| Tip | `seal-C-358-131` |
| Seal count | 131 |
| Sequence range | 1–131 |
| Cycles | C-332 → C-358 (skips C-354) |
| Fountain | `activating` |

This is the "old chain" visible in the Canon Browser bulk re-attest window (blocks 111–131).

#### Component 3 — Chain C (`lineage-seal-C-359-001`)

| Field | Value |
|-------|-------|
| Genesis | `seal-C-359-001` |
| Tip | `seal-C-370-029` |
| Seal count | 29 |
| Sequence range | 1–29 |
| Cycles | C-359 → C-370 |
| Fountain | `pending` |

This is the "new chain" (blocks 1–29) observed in Canon Browser.

### Re-attest cluster

| Field | Value |
|-------|-------|
| `attested_at_hour` | 2026-06-30T20 |
| `seal_count` | 283 |
| `sequence_range` | 1–194 |
| Cycles | C-308 → C-358 |

Confirms a bulk `attested_at` cluster in production KV on Jun 30 — consistent with custodian observation of near-identical `attested_at` on blocks 113–131.

**Caveat (checklist item 4 partial):** this is lineage-audit output only. Corroboration via `cron/reattest-seals` production logs is still required before item 4 can be marked DONE.

---

## Collision audit (`collision-audit.json`)

| Field | Value |
|-------|-------|
| `raw_attested_count` | 313 |
| `unique_block_count` | 194 |
| `collision_count` | 119 |
| `hash_divergent_collisions` | **119** (100% of collisions) |
| `alert` | **true** |
| `alert_threshold` | 0 |

### Severity: dual-quorum on every collision

Every collision entry shows `kept_quorum: 5` **and** `dropped_quorum: 5` with `seal_hashes_differ: true`. Both versions of each `block_number` were independently, fully sentinel-signed at different times.

**Example — block #1:**

| | Kept | Dropped |
|---|------|---------|
| Seal ID | `seal-C-359-001` | `seal-C-332-001` |
| Cycle | C-359 | C-332 |
| Sealed at | 2026-07-01T09:02:18Z | 2026-06-05T04:51:24Z |
| Quorum | 5 | 5 |

**Example — block #42 (orphan boundary):**

| | Kept | Dropped |
|---|------|---------|
| Seal ID | `seal-C-339-042` | `seal-C-308-042` |
| Cycle | C-339 | C-308 |
| Sealed at | 2026-06-12T00:55:34Z | 2026-05-11T07:51:02Z |

Collisions span blocks 1–131. Blocks 132–194 have no collision pairs in the current attested set.

---

## Governance questions (for seal-quorum authority)

1. **C-359 "reset" — custodian position: not intentional.** ZEUS verification catalog shows `latest_seal_id=seal-C-358-129` on 2026-06-30, then `latest_seal_id=null` by 2026-07-01T00:01Z, then forward sealing from `seal-C-359-002` onward with `vault_block_state=immortalized`. See [`NOTE_C-370_Michael-governance-no-reset.md`](./NOTE_C-370_Michael-governance-no-reset.md). **Revised root cause:** `LATEST_SEAL_KEY` continuity loss + missing `block_number` uniqueness — not authorized fork.

2. **What happened to the origin of the orphan fragment?** `seal-C-308-042`'s `prev_seal_hash` points to a hash absent from all 313 attested seals — was prior history deleted, never attested, or lost during migration?

3. **MIC / reward reconciliation:** 119 dropped seals reached full quorum before being discarded by export dedupe. Were rewards credited against those sealing events? Was accounting reconciled? **Requires explicit yes/no** — not left implicit.

4. **Which layer is authoritative?** Hot KV `prev_seal_hash` (three components) vs cold `.dat` synthetic chain (one contiguous 1–194). Export synthesis stitches eras that hot storage does not connect.

5. **Pipeline constraint gap (orthogonal to reset question):** Even if C-359 was not intentional, should `block_number` uniqueness and `LATEST_SEAL_KEY` preservation be enforced at seal formation regardless?

---

## Explicit non-recommendation

Per Canon law and EPICON scope:

- **No** agent-authored fix or rollback
- **No** merge/hold verdict on Substrate #380 without governance answer
- **No** further export/dedup work until MIC reconciliation and orphan fragment are addressed (reset question filed — not intentional per custodian)

---

## Related artifacts

| Artifact | Path |
|----------|------|
| Investigation handoff | [`HANDOFF_C-370_chain-continuity-audit.md`](./HANDOFF_C-370_chain-continuity-audit.md) |
| Custodian reframe | [`NOTE_C-370_Michael-to-ATLAS_chain-continuity-reframe.md`](./NOTE_C-370_Michael-to-ATLAS_chain-continuity-reframe.md) |
| Collision audit doc | [`AUDIT_C-370_reserve-block-collisions.md`](./AUDIT_C-370_reserve-block-collisions.md) |
| Custodian: no intentional reset | [`NOTE_C-370_Michael-governance-no-reset.md`](./NOTE_C-370_Michael-governance-no-reset.md) |
| Audit workflow | `.github/workflows/audit-reserve-block-lineage.yml` |
| Lineage script | `scripts/audit-seal-hash-lineage.ts` |
| Collision script | `scripts/audit-reserve-block-collisions.ts` |

---

*Confirmed 2026-07-13 from production KV. "We heal as we walk." — Mobius Systems*
