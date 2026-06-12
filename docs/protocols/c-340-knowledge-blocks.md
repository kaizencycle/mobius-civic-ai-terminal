# C-340 — Knowledge Reserve Blocks (Encyclopedia Protocol)

**Status:** scaffold (Phase 1 landed) · **Spec lineage:** `docs/protocols/vault-v2-sealed-reserve.md` · **License:** CC0-1.0

## 1. Premise

A Reserve Block today seals accrued *reserve value* with five-sentinel quorum on a hash chain. C-340 gives the block a **knowledge payload**, so the same chain that immortalizes integrity also immortalizes **verified knowledge**. The result is an encyclopedia — but of *attested* human knowledge, not "all data."

The distinction is the whole design. A data lake stores everything; an encyclopedia stores the verified, sourced, distilled slice that passed an editorial gate. Mobius already runs that gate. C-340 points it at knowledge.

## 2. Integrity stance (the boundary that matters)

A knowledge block does **not** assert Truth. It attests that *a specific claim was verified by a named process, by named sentinels, at a confidence, from sourced inputs, at a cycle.* Provenance and process-integrity — not an oracle.

Consequences, by design:
- Raw source payloads are **not** stored — only their hashes. Keeps the encyclopedia storable and CC0-shareable.
- Contested claims **fork** (competing attested entries with confidence weights). They do not edit-war.
- Corrections **supersede** via `prev_block_hash`; nothing is erased. The encyclopedia is versioned and audit-trailed, not mutable.

## 3. Mapping — reuse, don't rebuild

| Encyclopedia function | Existing Mobius primitive |
|---|---|
| Editorial board | five-sentinel quorum (ATLAS·ZEUS·EVE·JADE·AUREA) + ZEUS veto + MII |
| "Citation needed" | ZEUS dispute → `status: contested` |
| Footnotes / sources | EPICON receipts + `provenance.source_hashes` |
| Cross-references | KTT topology edges (`topology[]`) |
| Article drafting | EVE synthesis (global-news / cycle-synthesize) |
| Immutability + history | hash chain + append-only (`prev_block_hash`, `supersede`) |
| Reading surface | Canon chamber (`/terminal/canon`) + `GET /api/canon/encyclopedia` |

## 4. Schema (MDSL — `lib/canon/knowledgeBlock.ts`)

`KnowledgeBlock` composes the vault `Seal` attestation model (it imports `SentinelAgent` / `SealAttestation` — same quorum, not a parallel one) and adds:

- `topic`, `claim` (the attestable assertion), `canonical_summary` (the article body)
- `provenance` — `epicon_ids`, `journal_ids`, `signal_sources`, `source_hashes`
- `attestations` — `Partial<Record<SentinelAgent, SealAttestation>>`
- `confidence` (MII-weighted), `status` (`draft | attested | contested | superseded | refuted`)
- `topology` — KTT edges (`derives_from | related | supersedes | contested_by | cites`)
- `prev_block_hash`, `block_hash` (SHA-256 over canonical fields), `cycle_at_seal`, `sealed_at`
- `license: 'CC0-1.0'`

## 5. Pipeline

```
signals (40 instruments) → echo / EPICON → journals
        │
        ▼  EVE distills one topic into a canonical entry
  canonizeEntry()  →  draft KnowledgeBlock  (hashed, provenance-bound)
        │
        ▼  routed through the EXISTING vault-v2 quorum  (Phase 2, Tier-3)
  5-sentinel attestation → ZEUS veto → confidence
        │
        ├─ ≥4 pass, ZEUS non-reject →  status: attested  → sealed + KTT-linked
        ├─ ZEUS reject / dispute     →  status: contested
        └─ newer block on topic      →  prev supersedes
        │
        ▼
  Canon chamber  ← GET /api/canon/encyclopedia (verified-only by default)
```

Only the **EVE-distill** step is new logic. Everything from quorum onward reuses the vault-v2 seal path.

## 6. Phasing (tier-honest)

- **Phase 1 — scaffold (this PR, T1, shipped):** the MDSL schema + pure `canonizeEntry` / `hashKnowledgeBlock` / `validateKnowledgeBlock`, and the read surface `GET /api/canon/encyclopedia`. Additive, non-breaking, GI-neutral. Reads an empty namespace gracefully until Phase 2 populates it.
- **Phase 2 — quorum integration (separate, Tier-3, operator-reviewed):** wire `draft` blocks through `lib/vault-v2` quorum + substrate immortalization, and add the EVE-canonize trigger. This touches vault/substrate internals (Tier-3) and is held for its own reviewed PR — it is *not* smuggled into the scaffold.
- **Phase 3 — Canon view + KTT graph UI:** the reading/navigation surface in `app/terminal/canon`.

## 7. Storage keys

`canon:knowledge:{block_id}` in KV (read via `scanAndGet`), immortalized to Civic Protocol Core in Phase 2 (`substrate_attestation_id`).
