# C-370 Audit — Reserve Block `block_number` Collisions in Hot KV

**Date:** 2026-07-12  
**Operator cycle:** C-370  
**Export lane:** C-368 (prime cold canon)  
**Spec epoch:** C-357 (`.dat` format)

---

## Codex review (PR #380, 2026-07-12)

Codex P2 suggested re-exporting to reach ~350 blocks. **Disagree with re-export** —
see Substrate `docs/epicon/cycles/C-368/C368-PR7_prime-count-clarification.md`.

Summary: `313` attested seal **records** ≠ `194` unique **`block_number`** chain slots.
The ~350 runbook figure counted raw `seals_count`; MOBIUS01 canon requires one line per
unique `block_number`. Re-export yields the same 194 unless KV collisions are resolved first.

**Merge gate:** confirm `hash_divergent_collisions === 0` via audit script before merge.

---

## Summary

The first full prime export (`reserve-block-canon-export.yml`, `incremental: false`) surfaced
**119 duplicate `block_number` collisions** across **313 attested seals** → **194 unique blocks**
after dedupe. The deduped count (194) is what landed in `canon/reserve-blocks/MANIFEST.json` on
[Mobius-Substrate PR #380](https://github.com/kaizencycle/Mobius-Substrate/pull/380).

This is a real audit finding, not a benign export artifact. Empty `canon/reserve-blocks/` on
Substrate masked the collision set until the first export.

---

## Forensic tooling

```bash
# Human-readable report + JSON artifact under canon/reserve-blocks/
npx tsx scripts/audit-reserve-block-collisions.ts

# JSON to stdout (CI / automation)
npx tsx scripts/audit-reserve-block-collisions.ts --json

# Only pairs where kept vs dropped seals have different seal_hash (highest severity)
npx tsx scripts/audit-reserve-block-collisions.ts --hash-divergence-only
```

Requires production KV credentials in `.env.local` (`KV_REST_API_URL`, `KV_REST_API_TOKEN`).

Dedupe preference order (same as export): **quorum count → `sealed_at` → `seal_id`**.

---

## Known collision pattern (prime export run, 2026-07-12)

| Metric | Value |
|---|---|
| Raw attested seals | 313 |
| Unique `block_number` | 194 |
| Collision pairs | 119 |
| Hash-divergent pairs | **119** (confirmed 2026-07-13 via GitHub Actions KV audit) |

Example collisions from export logs (same `block_number`, different `cycle_at_seal`):

- Block #1: C-332 vs C-359
- Block #29: C-337 vs C-370

Most likely cause: **parallel chain eras / migration artifacts** in KV from pre-dedupe
pipeline work — not ongoing double-sealing. Live `formCandidate()` assigns monotonic
`sequence = prevSeal.sequence + 1`, and `appendSealToChain()` does not enforce uniqueness.

**Action:** Confirmed via GitHub Actions `audit-reserve-block-lineage.yml` on 2026-07-13.
`hash_divergent_collisions: 119` — **P0**. Every collision pair has `kept_quorum: 5` and
`dropped_quorum: 5`. See [`FINDINGS_C-370_chain-continuity-kv-audit.md`](./FINDINGS_C-370_chain-continuity-kv-audit.md).

---

## Item 6 monitoring

`/api/cron/reserve-canon-integrity` (Vercel cron `0 1 * * *`, daily after append at 00:30 UTC)
returns HTTP **409** when any of:

- `hot_cold_gap` — unique hot block count exceeds cold MANIFEST `total_blocks`
- `block_number_collisions` — any duplicate `block_number` in attested seals
- `collision_hash_divergence` — collision pair with differing `seal_hash`

Gap math uses **deduplicated** `sealed_hot_unique`, not raw seal count.

---

## Item 5 closure

Item 5 export machinery is **done**. Item 5 is **not closed** until Substrate PR #380 merges
and `main/canon/reserve-blocks/MANIFEST.json` shows `total_blocks: 194`.

Operator: paste EPICON-02 body from [`PR380_body.md`](./PR380_body.md) (or the wrapped copy in
[`OPERATOR_C-370_PR380_epicon-body.md`](./OPERATOR_C-370_PR380_epicon-body.md)) into PR #380.
