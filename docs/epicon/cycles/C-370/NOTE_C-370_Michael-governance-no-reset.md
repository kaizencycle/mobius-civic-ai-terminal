# Note — Custodian Position: No Intentional C-359 Reset

**From:** Michael Judan (human custodian)  
**To:** C-370 governance record  
**Date:** 2026-07-13  
**Re:** Checklist item 5 — fork/reset at C-359  
**Status:** Custodian position filed; corroborated by ZEUS verification catalog

---

## Position

**There was no intentional chain reset at C-359.** The `seal-C-359-001` genesis marker (`prev_seal_hash: null`) is a **pipeline artifact** — `getLatestSeal()` / `LATEST_SEAL_KEY` returned null when sealing resumed — not evidence of a documented governance fork.

Initial reference: [ZEUS verification 2026-07-02T06-03-27Z](https://github.com/kaizencycle/mobius-civic-ai-terminal/blob/1d590a2a633266bcf6eff9df2089c6f32d566be9/docs/catalog/zeus/2026-07-02T06-03-27Z-verification.json#L20) — `latest_seal_id=seal-C-359-003`, `vault_block_state=immortalized`, normal forward progress within C-359.

---

## Root cause (custodian, 2026-07-13)

**KV hot state went down when Upstash exceeded its max budget.** This is not a governance reset — it is infrastructure degradation during high-write activity (bulk re-attestation window aligns with Jun 30 `reattest_clusters`).

### How budget suspension fractures the chain (code path)

| Component | Behavior |
|-----------|----------|
| `lib/substrate/kv-errors.ts` | Detects Upstash suspension: `"exceeded the defined budget limit"` / `"database has been suspended"` |
| `lib/substrate/resilientWrite.ts` | `resilientSet()` **swallows** budget-suspension writes — returns `{ ok: false, kv_suspended: true }` without failing the caller |
| `lib/vault-v2/store.ts` | `appendSealToChain()` sets `vault:seal:latest` (`LATEST_SEAL_KEY`) in the same `Promise.all` as seal records — but **catches all errors with `console.warn` only** (lines 316–318) |

**Failure mode:** Under budget pressure, individual seal writes or re-attest updates may partially succeed while `LATEST_SEAL_KEY` write is skipped or lost. `getLatestSeal()` then returns null → `prev_seal_hash: null` on the next seal → apparent "genesis" at `seal-C-359-001`, while hundreds of prior attested seals remain in KV untouched.

### Catalog corroboration — prior budget suspension episodes

ATLAS heartbeats document live Upstash budget suspension (Jun 26–27):

- `docs/catalog/heartbeats/2026-06-27T23-04-56Z-atlas.json` — `primary_kv_suspended: true`, error: *"database has been suspended for exceeding the defined budget limit"*
- Same pattern across multiple Jun 26–27 heartbeats

Jun 30 heartbeats show `primary_kv_suspended: false` (KV recovered by then), but the **283-seal bulk re-attest cluster at `2026-06-30T20`** would have spiked write volume — consistent with custodian account of hot-state continuity loss by Jul 1 00:01Z when `latest_seal_id` went null.

---

| Timestamp | Cycle | `latest_seal_id` | `vault_block_state` | Notes |
|-----------|-------|------------------|---------------------|-------|
| 2026-06-30T12:04Z | C-358 | `seal-C-358-129` | attested | Old-chain tip still live in quorum/state |
| 2026-06-30T18:04Z | C-358 | `seal-C-358-129` | attested | Full quorum pass on 129 (`already_attested`, 5/5) |
| 2026-06-30T20:xx | — | — | — | KV `reattest_clusters`: 283 seals bulk `attested_at` (item 4 partial) |
| 2026-07-01T00:01Z | C-358 | **`null`** | accumulating | **LATEST pointer cleared** — no in-flight seal |
| 2026-07-01T06:02Z | C-359 | **`null`** | accumulating | C-359 cycle begins; still no latest seal |
| 2026-07-01T12:04Z | C-359 | `seal-C-359-002` | immortalized | Forward sealing resumed |
| 2026-07-02T06:03Z | C-360 | `seal-C-359-003` | immortalized | Custodian-cited verification |
| 2026-07-12T18:02Z | C-370 | `seal-C-370-029` | immortalized | Current chain tip |

**Interpretation:** Between Jun 30 evening and Jul 1 00:01 UTC, the operational `latest_seal_id` pointer dropped to `null` while old-chain attested seals (including `seal-C-358-129` and the bulk re-attested set) remained in KV. When `seal-C-359-001` formed (~Jul 1 09:02 per collision audit), `formCandidate()` saw no previous seal → genesis `prev_seal_hash`. Block numbering restarted at 1 because **`block_number` has no uniqueness constraint** — not because an operator declared a fork.

---

## What this changes in the governance framing

| Prior question | Revised framing |
|----------------|-----------------|
| Was C-359 restart intentional? | **Custodian: no.** No documented fork event found. |
| Root cause hypothesis | **Upstash KV budget suspension** during high-write window (bulk re-attest Jun 30) → `vault:seal:latest` continuity lost; **`block_number` uniqueness never enforced** → parallel chain eras in KV |
| Still open | Orphan fragment (`seal-C-308-042` `orphan_prev`); MIC reconciliation for 119 dropped dual-quorum seals |
| Pipeline fix (future, not this PR) | Enforce unique `block_number` at seal formation; make `LATEST_SEAL_KEY` write failure **fatal** (not swallowed); budget headroom / write batching for re-attest crons |

---

## Explicit non-recommendation

This note does **not** resolve the hot-KV integrity incident (`multiple_lineages: true` remains confirmed). It records custodian position that the dual-chain state arose from **operational/pipeline failure**, not authorized governance reset. Export/dedup hold remains until **Q1** (orphan fragment) is answered, **Q2** is accepted/signed by the custodian, and **Q3** MIC reconciliation completes.

---

## Source files

- `docs/catalog/zeus/2026-06-30T12-04-15Z-verification.json` — `seal-C-358-129`
- `docs/catalog/zeus/2026-06-30T18-04-30Z-verification.json` — quorum 5/5 on 129
- `docs/catalog/zeus/2026-07-01T00-01-30Z-verification.json` — `latest_seal_id=null`
- `docs/catalog/zeus/2026-07-01T06-02-09Z-verification.json` — C-359 accumulating, null latest
- `docs/catalog/zeus/2026-07-02T06-03-27Z-verification.json` — custodian reference
- [`FINDINGS_C-370_chain-continuity-kv-audit.md`](./FINDINGS_C-370_chain-continuity-kv-audit.md)

---

*Filed into C-370 audit trail.*
