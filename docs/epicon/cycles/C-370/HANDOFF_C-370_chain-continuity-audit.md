# EPICON Handoff — Reserve Block Chain Continuity (C-370)

**To:** ATLAS  
**From:** Michael Judan (human custodian)  
**Filed by:** ATLAS (Cursor agent)  
**Source:** Direct inspection of Mobius Substrate Canon Browser (Sentinel → Canon, read-only Phase 8/11 replay layer), 2026-07-12T23:36 UTC snapshot  
**Severity:** HIGH — chain-continuity question, not a count/dedup question  
**Status:** OPEN — investigation required; not independently verified against raw KV at filing time

**Custodian response:** [`NOTE_C-370_Michael-to-ATLAS_chain-continuity-reframe.md`](./NOTE_C-370_Michael-to-ATLAS_chain-continuity-reframe.md) — accepts scope correction; holds until KV audit JSON.

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
  COUNTERFACTUAL: If raw KV audit shows a single connected prev_seal_hash component (or UI pagination artifact), downgrade to documentation/UX clarification rather than chain-integrity incident.
counterfactuals:
  - This was first read from rendered Canon Browser UI, not raw KV/.dat — must be independently verified before treating as confirmed (lesson from fabricated journal-lock UI string earlier in C-370).
  - If the two lineages are a known fork-recovery event already documented elsewhere, downgrade to documentation gap rather than incident.
  - If disconnect is only in cold export synthetic chain vs hot KV, the finding reframes as "two hash semantics" not "broken canon."
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
| 1 | Verify Chain A ↔ Chain B disconnect in **raw KV**, not UI | `npx tsx scripts/audit-seal-hash-lineage.ts` (requires `.env.local` KV creds) | **PENDING** — operator run |
| 2 | Collision audit (block_number winners, hash divergence) | `npx tsx scripts/audit-reserve-block-collisions.ts` | Existing; run against prod KV |
| 3 | Confirm what `verify-dat-chain.js` validated | `Mobius-Substrate/scripts/verify-dat-chain.js` on `canon/reserve-blocks/` | **DONE** — see findings below |
| 4 | Confirm Jun 30 bulk re-attestation cluster | Lineage audit `reattest_clusters` + `cron/reattest-seals` logs | **PENDING** — operator run |
| 5 | Document known fork/reset at C-359 if intentional | Cycle journals, EPICON events, operator memory | **PENDING** |

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

## Explicit non-recommendation

This handoff does **not** recommend:

- A fix or rollback
- Merge/hold decision on #380
- Any canon mutation

Per Canon law: *"No rollback without proof, operator consent, and preserved incident history."*

**Next responsible step: operator-run KV audits (items 1, 2, 4), then ATLAS/AUREA review with JSON artifacts.**

---

## Operator commands

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
| Collision audit | `docs/epicon/cycles/C-370/AUDIT_C-370_reserve-block-collisions.md` |
| Prime count clarification | `Mobius-Substrate/docs/epicon/cycles/C-368/C368-PR7_prime-count-clarification.md` |
| Cold canon verify | `Mobius-Substrate/scripts/verify-dat-chain.js` |
| Cycle-state V2 bindings | `docs/epicon/cycles/C-370/CYCLE_STATE_V2.md` |
| Re-attest cron | `app/api/cron/reattest-seals/route.ts` |

---

*Filed 2026-07-12. "We heal as we walk." — Mobius Systems*
