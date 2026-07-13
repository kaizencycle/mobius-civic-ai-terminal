# EPICON Handoff — Reserve Block Chain Continuity (C-370)

**To:** ATLAS  
**From:** Michael Judan (human custodian)  
**Filed by:** ATLAS (Cursor agent)  
**Source:** Direct inspection of Mobius Substrate Canon Browser (Sentinel → Canon, read-only Phase 8/11 replay layer), 2026-07-12T23:36 UTC snapshot  
**Severity:** **P0** — confirmed multiple hot lineages + 119 hash-divergent dual-quorum collisions  
**Status:** **CONFIRMED** — production KV audit complete (2026-07-13); **governance decision required**

**Custodian response:** [`NOTE_C-370_Michael-to-ATLAS_chain-continuity-reframe.md`](./NOTE_C-370_Michael-to-ATLAS_chain-continuity-reframe.md) — scope correction accepted.

**Confirmed findings:** [`FINDINGS_C-370_chain-continuity-kv-audit.md`](./FINDINGS_C-370_chain-continuity-kv-audit.md) — full audit JSON summary from GitHub Actions run on `main`.

---

## EPICON Intent

```intent
epicon_id: EPICON_C-370_CANON_chain-continuity-audit_v1
ledger_id: kaizencycle
scope: specs
mode: normal
issued_at: 2026-07-12T23:45:00Z
justification:
  VALUES INVOKED: integrity, custodianship, observability
  REASONING: Canon Browser inspection suggests two disconnected prev_seal_hash lineages coexisting under overlapping Reserve Block numbering. If confirmed in raw KV, this is more fundamental than the 194-vs-354 count discrepancy because it concerns whether canon is one verifiable history or two parallel eras — not which count is correct within one chain.
  ANCHORS:
    - docs/epicon/cycles/C-370/HANDOFF_C-370_chain-continuity-audit.md
    - scripts/audit-seal-hash-lineage.ts
    - Mobius-Substrate/canon/reserve-blocks/MANIFEST.json
  BOUNDARIES: Investigation only. No rollback, merge/hold verdict on #380, or canon mutation without operator consent and preserved incident history.
  COUNTERFACTUAL: Raw KV audit (2026-07-13) confirmed multiple_lineages: true with 3 components and 119 hash-divergent dual-quorum collisions. Counterfactual branches below are resolved — this is a governance incident, not a UX artifact.
counterfactuals:
  - ~~If raw KV audit shows a single connected prev_seal_hash component~~ — **RESOLVED FALSE** (2026-07-13): three components + orphan.
  - If the two lineages are a known fork-recovery event already documented elsewhere, downgrade to documentation gap rather than incident — **PENDING governance answer (item 5)**.
  - Hot vs cold hash semantics distinction remains valid: verify-dat-chain.js validates synthetic export only, not hot KV continuity.
```

---

## What was observed (custodian report)

The Canon Browser renders Reserve Blocks with `seal_hash` and `previous_seal_hash`. Following linkage across the visible history:

### Chain A — "new" chain, blocks 1–29, cycles C-359 through C-370

- Block 1 (`seal-C-359-001`) has `previous_seal_hash: —` (genesis marker).
- Blocks 2–29 each chain to the prior block's `seal_hash`.
- Internally consistent; `fountain: pending` on inspected blocks.

### Chain B — "old" chain, blocks 111–131, cycles C-351 through C-358

- Internally consistent and hash-linked within the range.
- `fountain: activating` on inspected blocks (different Fountain-lane state than Chain A).
- Block 131 traces back through C-357/C-356/C-355 — does **not** link forward into Chain A's genesis, nor does Chain A link back into it.

**These appear as two separate hash-chain lineages, both `attested`, coexisting under overlapping-looking but functionally separate numbering.**

### Secondary observation — bulk re-attestation cluster

Blocks 113–131 carry near-identical `attested_at` timestamps (`Jun 30, 04:0X PM`) despite `sealed_at` / sentinel `signed_at` spread across June 23–28. Consistent with bulk re-attestation (Canon law: quarantined timeout blocks require re-attestation). Plausible but unconfirmed.

### Canon Browser context (why these 50 blocks appear together)

The Canon API (`buildSubstrateCanon`) returns the **last 50 seal IDs** from the full audit index (`listAllSeals(50)`), newest-first — not a contiguous `block_number` range. At the 2026-07-12 snapshot:

- 29 seals from Chain A (blocks 1–29, Jul 1–12 activity)
- 21 seals from Chain B (blocks 111–131, bulk re-attest Jun 30)

= **50 seals exactly**. Blocks 30–110 are not shown in this window.

---

## Why this matters more than 194-vs-354

The collision/dedupe work (#380/#598) assumed a single chain with duplicate `block_number` entries (re-seals across forked eras). That framing assumes one continuous lineage where the fix is "pick a winner per slot."

**If there are actually two separate, non-connecting hot-KV `prev_seal_hash` lineages, "pick a winner per slot" may not be the right mental model** — you cannot dedupe across two chains that were never the same lineage to begin with.

PR #380's `.dat` export reported **CHAIN VALID** for 194 blocks. It is not yet confirmed whether that verification covered all 354 attested seal records, silently excluded Chain B, or validated a **synthetically stitched** export chain distinct from hot KV linkage.

---

## Investigation checklist (required before resolution)

| # | Action | Tool / source | Status |
|---|--------|---------------|--------|
| 1 | Verify Chain A ↔ Chain B disconnect in **raw KV**, not UI | `npx tsx scripts/audit-seal-hash-lineage.ts` (requires `.env.local` KV creds) | **DONE** — `multiple_lineages: true`, 3 components; see [findings](./FINDINGS_C-370_chain-continuity-kv-audit.md) |
| 2 | Collision audit (block_number winners, hash divergence) | `npx tsx scripts/audit-reserve-block-collisions.ts` | **DONE** — 119 collisions, all hash-divergent, all dual-quorum |
| 3 | Confirm what `verify-dat-chain.js` validated | `Mobius-Substrate/scripts/verify-dat-chain.js` on `canon/reserve-blocks/` | **DONE** — see findings below |
| 4 | Confirm Jun 30 bulk re-attestation cluster | Lineage audit `reattest_clusters` + `cron/reattest-seals` logs | **PARTIAL** — KV cluster at `2026-06-30T20` (283 seals, seq 1–194) confirmed via lineage audit; **`cron/reattest-seals` production logs not yet cited** |
| 5 | Document known fork/reset at C-359 if intentional | Cycle journals, EPICON events, operator memory | **RESOLVED (infra)** — not a governance fork; see [GOVERNANCE Q2](./GOVERNANCE_DECISION_C-370_chain-continuity.md); custodian accept pending |

---

## ATLAS preliminary findings (code + cold canon, 2026-07-12)

*These are analytical findings from repository inspection and Substrate `main` cold canon. They do not replace item 1 (live KV audit).*

### Finding 1: Hot KV and cold export use **different hash chains**

| Layer | Link field | Semantics |
|-------|------------|-----------|
| **Hot KV** (`lib/vault-v2/seal.ts`) | `prev_seal_hash` | Points to `getLatestSeal()` at seal formation time — chronological append chain |
| **Cold `.dat` export** (`lib/dat/hashDatRecord.ts`) | `prev_hash` | **Synthesized** at export: walks deduped winners sorted by `block_number`, ignores hot `prev_seal_hash` |

Cold export explicitly builds a new MOBIUS01 hash chain via `buildDatRecord(block, chainTip)` in `lib/dat/canonize.ts`. `verify-dat-chain.js` validates **only this synthetic export chain**.

### Finding 2: Cold canon on `main` **is** one contiguous synthetic chain 1–194

Verified from `Mobius-Substrate/canon/reserve-blocks/blk0000.dat`:

| block_number | cycle | prev links to |
|--------------|-------|---------------|
| 1 | C-359 | genesis (`000…000`) |
| 29 | C-370 | block 28 hash |
| 30 | C-337 | **block 29 hash** (`sha256:b5e8e232…`) |

After dedupe-by-`block_number`, the cold canon stitches C-359+ era blocks 1–29 into older-era blocks 30–194. The 29→30 link is an **export-time synthesis**, not a preserved hot-KV `prev_seal_hash` relationship.

### Finding 3: PR #380 scope is the deduped export, not all 354 seal records

Per `Mobius-Substrate/docs/epicon/cycles/C-368/C368-PR7_prime-count-clarification.md`:

- Raw attested seals in KV at export: **313**
- Unique `block_number` after dedupe: **194**
- `verify-dat-chain.js`: validates contiguous 1–194 synthetic chain only
- Dropped collision seals (119 pairs): **not** walked by verify

### Finding 4: Multiple `prev_seal_hash` genesis points in hot KV is **plausible by design**

`formCandidate()` sets `prev_seal_hash = prevSeal?.seal_hash ?? null`. A new genesis (`prev_seal_hash: null`) at `seal-C-359-001` implies `getLatestSeal()` returned null at formation — consistent with a chain reset or empty `LATEST_SEAL_KEY` at C-359 start. Old-era seals (e.g. 111–131) can remain in KV with their own internal linkage.

Whether that reset was **documented and intentional** is an open governance question, not yet answered by code inspection alone.

### Finding 5: Canon Browser does not walk or verify full-chain continuity

`lib/substrate/canon.ts` maps each seal's stored `prev_seal_hash` to `previous_seal_hash` for display. No bulk chain-walk or component analysis is performed. The UI can show multiple internally-consistent sub-chains side by side without flagging disconnect.

---

## Confirmed KV audit findings (2026-07-13)

*Source: GitHub Actions workflow on production KV. Full detail in [`FINDINGS_C-370_chain-continuity-kv-audit.md`](./FINDINGS_C-370_chain-continuity-kv-audit.md).*

### Finding 6: `multiple_lineages: true` — three hot-KV components

| Component | Genesis | Tip | Seals | Seq range | Cycles | Fountain |
|-----------|---------|-----|-------|-----------|--------|----------|
| Orphan fragment | **none** | `seal-C-332-194` | 153 | 42–194 | C-308→C-332 | activating |
| Chain B | `seal-C-332-001` | `seal-C-358-131` | 131 | 1–131 | C-332→C-358 | activating |
| Chain C | `seal-C-359-001` | `seal-C-370-029` | 29 | 1–29 | C-359→C-370 | pending |

`genesis_count: 2` plus one orphan fragment without genesis. `seal-C-308-042` has `orphan_prev` — its `prev_seal_hash` matches no attested seal.

The custodian's Canon Browser observation is **confirmed and understated**: not two disconnected chains, but **two genesis-rooted chains plus an orphan fragment** whose origin has vanished from the attested set.

### Finding 7: 119 hash-divergent collisions, all dual-quorum

- `raw_attested_count: 313`, `unique_block_count: 194`, `collision_count: 119`
- **`hash_divergent_collisions: 119`** — every collision has different `seal_hash` values
- **Every pair:** `kept_quorum: 5` AND `dropped_quorum: 5` — both sides fully sentinel-signed at different times (often weeks apart)
- `alert: true` at `alert_threshold: 0` — P0 hold condition

Example block #1: kept `seal-C-359-001` (Jul 1) vs dropped `seal-C-332-001` (Jun 5).

This is not retry/resend noise. The sealing pipeline fully validated and quorum-attested the same `block_number` twice as separate, complete events.

### Finding 8: MIC / reward reconciliation is an open governance question

If MIC was credited or reward-accounted against any of the 119 dropped sealing events before the pipeline reset, reconciliation status is unknown. This requires human custodian review — not a dedup rule in code.

### Finding 9: Bulk re-attestation cluster — KV evidence only (item 4 partial)

`reattest_clusters[0]`: `2026-06-30T20`, 283 seals, sequence 1–194, cycles C-308→C-358. Corroborates custodian observation of near-identical `attested_at` on blocks 113–131.

**Not yet closed:** checklist item 4 also requires `cron/reattest-seals` production logs (`app/api/cron/reattest-seals/route.ts`). The lineage audit workflow does not fetch those logs; operator should paste Vercel/runtime log evidence from the Jun 30 window before marking item 4 DONE.

---

## Explicit non-recommendation

This handoff does **not** recommend:

- A fix or rollback
- Merge/hold decision on #380
- Any canon mutation

Per Canon law: *"No rollback without proof, operator consent, and preserved incident history."*

**Next responsible step: governance decision — [`GOVERNANCE_DECISION_C-370_chain-continuity.md`](./GOVERNANCE_DECISION_C-370_chain-continuity.md). MIC lookup: [`MIC_RECONCILIATION_C-370_dropped-seals.md`](./MIC_RECONCILIATION_C-370_dropped-seals.md). Hold export/dedup (#380/#598) until Q1 and Q2 are signed.**

---

## Operator commands

### Option A — GitHub Actions (recommended; no creds in chat)

1. Open [Actions → Audit Reserve Block Lineage](https://github.com/kaizencycle/mobius-civic-ai-terminal/actions/workflows/audit-reserve-block-lineage.yml)
2. **Run workflow** (workflow_dispatch; uses existing `KV_REST_API_URL` / `KV_REST_API_TOKEN` secrets)
3. Download the **reserve-block-audit** artifact (`lineage-audit.json`, `collision-audit.json`)
4. Paste **JSON only** into the C-370 thread — check `multiple_lineages` and `reattest_clusters` in the job summary

### Option B — Local (Michael machine)

```bash
cd mobius-civic-ai-terminal
# KV_REST_API_URL + KV_REST_API_TOKEN in .env.local (production)

npx tsx scripts/audit-seal-hash-lineage.ts --json | tee /tmp/lineage-audit.json
npx tsx scripts/audit-reserve-block-collisions.ts --json | tee /tmp/collision-audit.json
```

**Interpret lineage report:**

- `multiple_lineages: true` + `components.length > 1` → custodian observation **confirmed in raw KV**
- `orphan_prev` on Chain B's first visible block → disconnect at era boundary
- `reattest_clusters` → candidate bulk re-attestation windows for item 4

---

## Related artifacts

| Artifact | Path |
|----------|------|
| **KV audit findings (confirmed)** | `docs/epicon/cycles/C-370/FINDINGS_C-370_chain-continuity-kv-audit.md` |
| Collision audit | `docs/epicon/cycles/C-370/AUDIT_C-370_reserve-block-collisions.md` |
| Prime count clarification | `Mobius-Substrate/docs/epicon/cycles/C-368/C368-PR7_prime-count-clarification.md` |
| Cold canon verify | `Mobius-Substrate/scripts/verify-dat-chain.js` |
| Cycle-state V2 bindings | `docs/epicon/cycles/C-370/CYCLE_STATE_V2.md` |
| Governance decision (OPEN) | [`GOVERNANCE_DECISION_C-370_chain-continuity.md`](./GOVERNANCE_DECISION_C-370_chain-continuity.md) |
| MIC reconciliation checklist | [`MIC_RECONCILIATION_C-370_dropped-seals.md`](./MIC_RECONCILIATION_C-370_dropped-seals.md) |
| Re-attest cron | `app/api/cron/reattest-seals/route.ts` |

---

*Filed 2026-07-12. KV audit confirmed 2026-07-13. "We heal as we walk." — Mobius Systems*
