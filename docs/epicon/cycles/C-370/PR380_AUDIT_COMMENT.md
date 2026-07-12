# PR #380 — Collision audit comment template

Post this on [Mobius-Substrate #380](https://github.com/kaizencycle/Mobius-Substrate/pull/380) after running the forensic audit.

## Run

```bash
cd mobius-civic-ai-terminal
# .env.local must have KV_REST_API_URL + KV_REST_API_TOKEN (Vercel production)
npx tsx scripts/audit-reserve-block-collisions.ts --json | tee /tmp/collision-audit.json
```

---

## Comment to paste (fill in `[...]` from JSON output)

```markdown
## C-370 collision audit — production KV

**Run:** `[ISO timestamp]`  
**Operator:** `[your handle]`  
**Script:** `scripts/audit-reserve-block-collisions.ts` @ mobius-civic-ai-terminal `[commit or branch]`

### Results

| Metric | Value |
|---|---|
| Raw attested seals | `[raw_attested_count]` |
| Unique `block_number` | `[unique_block_count]` |
| Collision pairs | `[collision_count]` |
| **Hash-divergent pairs** | **`[hash_divergent_collisions]`** |

### Verdict

- [ ] **`hash_divergent_collisions === 0`** — 194-block prime is **confirmed honest**; safe to merge after EPICON gate passes
- [ ] **`hash_divergent_collisions > 0`** — **P0 hold** — two different payloads claim the same `block_number`; do not merge until governance resolves

### Notes

`[Optional: paste 2–3 sample collisions if hash-divergent > 0, or "all collisions are re-seal era duplicates with identical seal_hash"]`

### Live vault status at audit time

- `seals_count`: `[from /api/vault/status]`
- `reserve_blocks_sealed`: `[same]`
- Cold MANIFEST `total_blocks` (this PR): **194**

> Raw `seals_count` may exceed 194 after export — that is expected (new seals since prime + duplicate-era records). Merge criterion is **zero hash divergence** on the exported set, not raw count equality.
```

---

## Example (fill when you have real output)

```markdown
## C-370 collision audit — production KV

**Run:** `2026-07-12T19:45:00Z`  
**Operator:** `@kaizencycle`  
**Script:** `scripts/audit-reserve-block-collisions.ts` @ `cursor/c370-reserve-integrity-audit-0e02`

### Results

| Metric | Value |
|---|---|
| Raw attested seals | 354 |
| Unique `block_number` | 194 |
| Collision pairs | 160 |
| **Hash-divergent pairs** | **0** |

### Verdict

- [x] **`hash_divergent_collisions === 0`** — 194-block prime is **confirmed honest**; safe to merge after EPICON gate passes

### Notes

All collisions are forked-era re-seals (same `block_number`, different `cycle_at_seal`); dropped seals share `seal_hash` with kept winner or differ only by attestation metadata. No competing payloads at the same chain position.

### Live vault status at audit time

- `seals_count`: 354
- `reserve_blocks_sealed`: 354
- Cold MANIFEST `total_blocks` (this PR): **194**
```
