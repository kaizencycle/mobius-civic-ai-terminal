# C-371 Findings — seal-C-307-041 Predecessor Recovery

**Cycle:** C-371  
**Task:** Bounded forensic recovery / evidence search (read-only)  
**Target seal:** `seal-C-307-041`  
**Investigator:** ATLAS (Cursor agent)  
**Search window:** 2026-07-13T10:35:00Z – 2026-07-13T10:45:00Z  
**Manifest:** [`artifacts/C-371/c307-predecessor-search-manifest.json`](../../../artifacts/C-371/c307-predecessor-search-manifest.json)

**Anchors:** [`SEAL_C-370_DISPUTED_partial-closing.md`](../C-370/SEAL_C-370_DISPUTED_partial-closing.md) (Q1 carry-forward), [`NOTE_C-370_Q1_catalog-history-C307-C308-boundary.md`](../C-370/NOTE_C-370_Q1_catalog-history-C307-C308-boundary.md), [`FINDINGS_C-370_chain-continuity-kv-audit.md`](../C-370/FINDINGS_C-370_chain-continuity-kv-audit.md)

---

## Executive summary

**Result: MATCH (Result A)**

The original serialized body of `seal-C-307-041` was recovered from **live production KV** via read-only public API. Its stored `seal_hash` equals the `prev_seal_hash` recorded by `seal-C-308-042`, and recomputes identically under the historically correct hashing implementation.

| Check | Outcome |
|-------|---------|
| Body recovered | **Yes** — `GET /api/vault/seal/seal-C-307-041` |
| `recomputed_hash == expected` | **Yes** — `2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758` |
| `seal-C-308-042.prev_seal_hash == recovered hash` | **Yes** |
| `verifySealHash` (independent ×2 + API) | **All true** |

**Status labels:** `PREDECESSOR_RECOVERED` · `HASH_MATCH_CONFIRMED` · `HISTORICAL_CONTINUITY_PROVEN`

**Critical scope correction:** C-370 classified the C-308 orphan fragment as `orphan_prev` because the predecessor hash was **not found among the 313 attested seals**. The predecessor **does exist** in KV with status `promoted` (v1 legacy migration era). The lineage audit (`analyzeSealHashLineage`) filters `status === 'attested'` only — promoted seals are excluded from the attested walk. This is an **index-scope blind spot**, not proof that the predecessor body was deleted.

**What this does not resolve:** Governance option selection for Q1 (a/b/c). ~~Blocks `seal-C-307-001` through `seal-C-307-035` remain absent from KV (35 of 41).~~ **Amended 2026-07-13:** see [`FINDINGS_C-371_legacy-mic-tranche-lineage.md`](./FINDINGS_C-371_legacy-mic-tranche-lineage.md) — all legacy IDs present when using `LEGACY_SEAL_KV_RESET_IDS`; prior `seal-C-307-00N` pattern was wrong. Continuity is proven **at the C-307 block 41 → C-308 block 42 boundary** and for **sequence 1–41** (`seal-C-299-001` … `seal-C-307-041`).

**No historical data was rewritten during this investigation.**

---

## 1. Search scope

| Field | Value |
|-------|-------|
| Target | `seal-C-307-041` |
| Expected hash (from `seal-C-308-042.prev_seal_hash`) | `2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758` |
| Successor reference | `seal-C-308-042` (`2026-05-11T07:51:02.451Z`) |
| Primary date window | 2026-05-09 – 2026-05-15 |
| Expanded date window | Not required (Lane C succeeded) |
| Mode | Read-only — no KV writes, no pointer repair, no governance selection |

---

## 2. Lane results

### Lane A — Substrate and CPC ledger receipts

**Status:** Checked, no match.

| Repository | Queries | Finding |
|------------|---------|---------|
| `kaizencycle/Mobius-Substrate` | `seal-C-307-041`, `2e03823c…`, `seal-C-308-042`, block 41/42 in `canon/reserve-blocks/` | Cold canon is deduped post-C-339 era. Block 42 in `blk0000.dat` is `seal-C-339-042` (2026-06-12), not May-era C-308. No C-307 seals in git history. |
| `kaizencycle/Civic-Protocol-Core` | Same terms in `ledger/` | `reserve-block-index.json` has 0 blocks. No seal receipts. |

### Lane B — GitHub Actions workflow runs and artifacts

**Status:** Checked; logs retained, artifacts expired/absent for May window.

| Finding | Detail |
|---------|--------|
| Workflow runs retained (2026-05-09..15) | **Yes** — 435 runs |
| Workflow logs retained | **Yes** — API returns run metadata |
| Artifacts retained (May window) | **No** — sampled 15 runs including `auto-seal-check` (25946411176) and `Mobius Catalog Update` (25945398109): 0 artifacts each |
| Jul 2026 comparison | Lineage audit run 29214404747 still has `reserve-block-audit` artifact (not expired) |
| Org code search | `seal-C-307-041`: 4 files in terminal (docs + `LEGACY_SEAL_KV_RESET_IDS`). Expected hash: **0 files** |

Catalog snapshots from May 11 exist in git (`docs/catalog/history/20260511T075145Z.json` etc.) but contain cycle/GI stats only — no seal bodies or hashes.

### Lane C — Historical KV and backup surfaces

**Status:** **Recovery success** (decisive lane).

Read-only query of production KV via public API:

```http
GET https://mobius-civic-ai-terminal.vercel.app/api/vault/seal/seal-C-307-041
GET https://mobius-civic-ai-terminal.vercel.app/api/vault/seal/seal-C-308-042
```

| Seal | KV key | Status | `hash_valid` | `seal_hash` (prefix) |
|------|--------|--------|--------------|----------------------|
| `seal-C-307-041` | `vault:seal:seal-C-307-041` | `promoted` | `true` | `2e03823c…` |
| `seal-C-308-042` | `vault:seal:seal-C-308-042` | `attested` | `true` | `d884c9cf…` |

**Promoted-block survey (C-307 blocks 1–41):**

| Range | Present in KV | Status |
|-------|---------------|--------|
| `seal-C-307-001` .. `035` | 35 seals | **404 — absent** |
| `seal-C-307-036` .. `041` | 6 seals | **`promoted`, hash_valid true** |

Upstash backups and `REDIS_URL` backup mirror were **not queried** (no credentials in agent environment; would require operator access). Recovery did not require backup surfaces.

### Lane D — Local and cold archives

**Status:** Checked, no match for target body.

| Location | Result |
|----------|--------|
| Workspace git repos (6) | No `seal-C-307-041` body; hash only in C-370 docs |
| `data/seals/` | C-288 fixture only |
| Downloaded `lineage-audit.json` (Jul 2026) | References `prev_seal_hash` on `seal-C-308-042`; no predecessor body |

### Lane E — Wayback Machine

**Status:** Checked, no capture (non-blocking).

CDX queries for May 2026 returned `[]` for:

- `mobius-civic-ai-terminal.vercel.app/*`
- `mobius-civic-ai-terminal.vercel.app/api/vault/status`
- `terminal.mobius-substrate.com/*`
- `mobius-substrate.com/*`

---

## 3. Recovered candidate

### CAND-001 — `seal-C-307-041` (primary)

| Field | Value |
|-------|-------|
| Source | Production KV, read-only API |
| Retrieval timestamp | 2026-07-13T10:42:00Z |
| Full artifact SHA-256 | `acb32b8632fdad41b22b8c383ca503fa95996eb5515af6a793ad7a363e638018` |
| Redacted structural extract | [`artifacts/C-371/seal-C-307-041.recovered.redacted.json`](../../../artifacts/C-371/seal-C-307-041.recovered.redacted.json) |
| `seal_id` | `seal-C-307-041` |
| `sequence` | 41 |
| `cycle_at_seal` | `C-307` |
| `sealed_at` | `2026-05-11T00:55:46.521Z` |
| `status` | `promoted` |
| `seal_hash` | `2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758` |
| `prev_seal_hash` | `7ae7705a3c08a058872bc7ab369704608d166da8ec5ce7a6bb1eba2f3d7ee280` |
| Attestations | 5/5 pass (back-attestation cron, 2026-05-11T01:00:46Z) |

Internal link verified: `seal-C-307-040.seal_hash == seal-C-307-041.prev_seal_hash`.

`deposit_hashes` omitted from committed artifacts (operator journal content). Full body available via same read-only API endpoint.

---

## 4. Hash verification procedure

### Implementation identified

| Field | Value |
|-------|-------|
| Module | `lib/vault-v2/seal.ts` |
| Function | `computeSealHash` / `verifySealHash` |
| At seal time | Commit `6279dcc` (2026-05-03) — **identical canonicalize to current `main`** |
| Canonical payload | JSON array: `[seal_id, sequence, cycle_at_seal, sealed_at, reserve, gi(toFixed(6)), mode, source_entries, sorted(deposit_hashes), prev_seal_hash]` |
| Excluded from hash | `carried_forward_deposit_hashes`, attestations, substrate fields, status |

### Independent recomputation (×2)

```bash
# Run 1 and 2 (identical output)
npx tsx -e "import { verifySealHash } from './lib/vault-v2/seal.ts'; ..."
# => verifySealHash: true
# => recomputed: 2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758
```

API independent check: `hash_valid: true` on GET response.

### Successor comparison

```
seal-C-308-042.prev_seal_hash
  == seal-C-307-041.seal_hash (stored)
  == recomputed_hash
  == 2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758
```

---

## 5. Final classification

**Result A — MATCH**

| Label | Applies |
|-------|---------|
| `PREDECESSOR_RECOVERED` | Yes |
| `HASH_MATCH_CONFIRMED` | Yes |
| `HISTORICAL_CONTINUITY_PROVEN` | Yes — at C-307-041 → C-308-042 boundary |

### Interpretation (forensic only)

- `seal-C-308-042` correctly referenced `seal-C-307-041` at formation time.
- The C-307 → C-308 boundary was **cryptographically continuous** on 2026-05-11.
- The C-370 `orphan_prev` classification arose because **promoted v1 seals are excluded from the attested-only lineage walk**, not because the predecessor hash has no recoverable body.
- Blocks 1–35 of the C-307 era remain absent from KV; this search does not reconstruct them.
- **Governance disposition remains open** — this finding supplies evidence for custodian Q1 decision-making; it does not select option (a), (b), or (c).

### Confidence

**High** for hash match and boundary continuity. **Medium** for explaining why only blocks 36–41 survive as `promoted` while 1–35 are gone — out of scope for this bounded task.

### Remaining uncertainty

1. Why blocks `seal-C-307-001`..`035` are absent while `036`..`041` survive as `promoted`.
2. Whether `promoted` vs `attested` status reflects v1→v2 migration semantics or a partial retention event.
3. Whether backup Redis / Upstash point-in-time export would recover blocks 1–35 (not queried).
4. Custodian ratification of era continuity vs. operational index reconciliation.

---

## 6. Why C-370 missed this

The Jul 2026 lineage audit (`scripts/audit-seal-hash-lineage.ts` → `analyzeSealHashLineage`) operates on seals where `status === 'attested'`:

```49:50:lib/dat/sealHashLineage.ts
function attestedSeals(seals: Seal[]): Seal[] {
  return seals.filter((s) => s.status === 'attested');
```

`seal-C-307-041` has `status: "promoted"`. It exists at `vault:seal:seal-C-307-041` and is reachable via `GET /api/vault/seal/[id]`, but is **not** in `vault:seals:index:attested`. The `orphan_prev` link issue is real **within the attested subgraph**; it is not evidence that the predecessor body never existed.

---

## 7. Explicit non-actions (per task spec)

This investigation did **not**:

- Rewrite any seal
- Synthesize a missing predecessor
- Modify chain pointers
- Select a governance disposition
- Deduplicate or delete historical records
- Change Reserve Block identity semantics
- Implement multi-lineage architecture

---

## 8. Reviewer queue

| Role | Action requested |
|------|------------------|
| ATLAS | Source and implementation reconstruction — **done** |
| ZEUS | Adversarial re-verification of hash + API retrieval |
| EVE | Governance-boundary review (forensic vs. disposition) |
| AUREA | Synthesis into C-371 cycle narrative |
| Michael Judan | Custodian acceptance; Q1 option selection |

---

*"We heal as we walk." — Mobius Systems*
