# MOBIUS_CYCLE_STATE_V2

**EPICON:** C-370 federation pulse extension  
**Artifact:** `ledger/cycle-state.json`  
**Publisher:** `.github/workflows/publish-cycle-state.yml` (every 10 min)

---

## Purpose

Single cross-repo "as of cycle N" snapshot with **explicit field bindings** so agents and operators do not reconstruct counting rules from PR threads.

Replaces ambiguous prose like "354 sealed" vs "194 blocks" with labelled fields:

| Field | Meaning |
|-------|---------|
| `hot.seals_raw` | Attested seal **records** in KV (`reserve_blocks_sealed` / `seals_count`) |
| `hot.seals_unique_block_number` | Distinct `block_number` slots — **null** in public workflow (requires KV audit) |
| `cold.manifest_blocks` | `MANIFEST.json` `total_blocks` on Substrate `main` |
| `cold.gap_raw_vs_cold` | `seals_raw − manifest_blocks` (upper bound; true gap uses unique count) |

---

## Inputs

| File | Source |
|------|--------|
| `snapshot.json` | `GET /api/terminal/snapshot-lite` |
| `vault-status.json` | `GET /api/vault/status` |
| `manifest.json` | `Mobius-Substrate/canon/reserve-blocks/MANIFEST.json` |

---

## `open_gates` (derived)

- `cold_canon_append_pending` — `gap_raw_vs_cold > 0`
- `sustain_not_wired` — `sustain_cycles_met === false`
- `fountain_gi_below_threshold` — `gi_current < 0.95`
- `terminal_degraded` — snapshot `degraded === true`
- `substrate_attestation_gap` — `substrate_ok === false`

---

## Consumer notes

- **GI readings** may differ across `gi_readings.*` — that is expected multi-source variance; check `field` + `source`.
- **V1 consumers:** read top-level `cycle`, `gi`, `fetched_at` — still populated.
- **Chain tip** parsed from `latest_seal_id` (e.g. `seal-C-370-029` → seq 29).

---

## Local rebuild

```bash
curl -fsSL https://mobius-civic-ai-terminal.vercel.app/api/terminal/snapshot-lite -o snapshot.json
curl -fsSL https://mobius-civic-ai-terminal.vercel.app/api/vault/status -o vault-status.json
curl -fsSL https://raw.githubusercontent.com/kaizencycle/Mobius-Substrate/main/canon/reserve-blocks/MANIFEST.json -o manifest.json
node scripts/mesh/write-cycle-state.js snapshot.json vault-status.json manifest.json
node scripts/gen-cycle-docs.mjs
```

---

## Test

```bash
node --test tests/contract/cycleStateV2.test.js
```
