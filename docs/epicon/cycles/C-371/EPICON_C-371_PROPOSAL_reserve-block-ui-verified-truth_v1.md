---
epicon_id: EPICON_C-371_PROPOSAL_reserve-block-ui-verified-truth_v1
title: "Reserve Block UI — Representing Verified Truth, Not a Flat Count"
author_name: "Michael Judan (custodian), drafted with Claude"
author_wallet: ""
cycle: "C-371"
epoch: ""
tier: "TERMINAL"
scope:
  domain: "ui"
  system: "civic-ai-terminal"
  environment: "mainnet"
epicon_type: "feature-proposal"
status: "proposal"
related_prs:
  - "https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/617"
  - "https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/618"
  - "https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/619"
related_epicons:
  - "EPICON_C-371_PROPOSAL_lineage-audit-historical-index_v1"
  - "EPICON_C-370_EVE_kv-watchdog-proposal_v1"
tags:
  - "reserve-blocks"
  - "ui"
  - "canon-browser"
  - "vault"
  - "provenance"
  - "chain-continuity"
  - "c-370"
  - "c-371"
integrity_index_baseline: null
risk_level: "medium"
created_at: "2026-07-13T18:00:00Z"
updated_at: "2026-07-13T18:00:00Z"
version: 1
hash_hint: ""
summary: "Design proposal to decompose Reserve Block counts by era/method, render collision pairs side-by-side, expose status badges and verification tiers, extract a shared query layer for UI/audit/export/watchdog, and persist critical findings until explicitly resolved. Display-only — no sealing or reconciliation logic changes."
---

# Proposal — Reserve Block UI: Representing Verified Truth, Not a Flat Count

**Author:** Michael Judan (custodian), drafted with Claude  
**Cycle:** C-371  
**Type:** Feature proposal — not yet implemented  
**Ties to:** The entire C-370→C-371 chain-continuity investigation. Nearly every
confusion in that investigation (194 vs 354, the fictional "journal lock," the
Q1 orphan false-alarm) traced back to the UI (and the tooling behind it)
presenting a single flat number or string with no visible provenance, method,
or era. This proposal is the UI-layer fix for that root pattern.

**Evidence base:**

- [`VERIFICATION_C-371_ZEUS_full-reserve-lineage.md`](./VERIFICATION_C-371_ZEUS_full-reserve-lineage.md)
- [`VERIFICATION_C-371_ECHO_storage-and-index-continuity.md`](./VERIFICATION_C-371_ECHO_storage-and-index-continuity.md)
- [`GOVERNANCE_DECISION_C-370_chain-continuity.md`](../C-370/GOVERNANCE_DECISION_C-370_chain-continuity.md)
- [`EPICON_C-371_PROPOSAL_lineage-audit-historical-index_v1.md`](./EPICON_C-371_PROPOSAL_lineage-audit-historical-index_v1.md)

---

## 1. Why this, why now

C-371's opening principle already states it: *"No UI-derived truth. Canon →
Ledger → Runtime evidence → UI."* This proposal is what it takes to actually
make that true for Reserve Blocks specifically, given everything discovered
this cycle:

- "354 sealed blocks" (Vault dashboard) vs. "194 unique blocks" (cold canon
  export) were both real numbers, computed by different methods over
  different subsets of the same data — and the UI showed one of them with no
  indication a second, equally valid number existed.
- The Canon Browser's "journal lock" / "ZEUS DISPUTE ROOT CAUSES" text was
  confirmed to be hardcoded placeholder copy, not live telemetry — and it was
  indistinguishable from real data at a glance.
- The Q1 "orphan fragment" looked like historical data loss in the UI's
  flattened, sequential block list; it was actually a live, connected,
  cryptographically-proven lineage the whole time, just rendered as if it
  were broken because the underlying audit method (and the UI reading its
  output) used the wrong ID pattern and status filter.

None of these were UI bugs in the traditional sense. They were the UI
faithfully rendering undecomposed, unlabeled, or stale outputs from tooling
that had its own undisclosed assumptions baked in. The fix has to happen at
both layers together.

---

## 2. Core principle

**Every number, string, or status shown for a Reserve Block must be
traceable, in the UI itself, to: which lineage it belongs to, which counting
or traversal method produced it, and how fresh it is.** If a value can't
carry that provenance, it should not render as a bare fact.

---

## 3. Concrete UI changes

### 3.1 No bare counts

Replace single numbers like "354 sealed blocks" with a decomposed view,
expandable inline (not buried in a tooltip nobody clicks):

```text
Reserve Blocks: 313 raw attested seals
  ├─ 194 unique (post-C-359 active chain, deduped)
  ├─ 119 superseded (collision pairs, both preserved — see below)
  ├─ 49 legacy MIC tranche (C-299–C-307, proven continuous)
  └─ 8 pre-continuous genesis seals (C-288–C-298)
```

This is not a simplification of the current display — it is *more* information
than currently shown, organized so the decomposition is the default view, not
an expert-mode toggle.

### 3.2 Eras rendered as eras, not one sequential list

The current Canon Browser flattens everything into one ascending block-number
list, which is what made a legitimate multi-lineage history look like
sequential corruption. Replace with distinct, labeled, independently
navigable tracks:

| Era | Cycles | Status |
|---|---|---|
| Pre-continuous genesis | C-288–C-298 | 8 independent genesis seals |
| Legacy MIC tranche | C-299–C-307 | Continuous, proven (PR #618) |
| Attested fragment | C-308–C-332 | Continuous, boundary proven (PR #617) |
| June chain | C-332–C-358 | Independent lineage, `superseded_operational` |
| July chain (active) | C-359–present | `active_canonical`, currently extending |

A viewer should be able to tell which era they're looking at without leaving
the page or cross-referencing a doc.

### 3.3 Collision pairs shown together

For each of the 119 collided `block_number`s, render both seals side by
side with their status badges, not just the "winner." Example:

```text
Block #42
  ├─ seal-C-339-042  [active_canonical]     sealed 2026-06-12
  └─ seal-C-308-042  [historical_attested]  sealed 2026-05-11  ← proven continuous, see Era: Legacy tranche
```

Hiding the superseded seal is what made deduplication look like data loss.

### 3.4 Status as a first-class visible field

Every rendered seal carries one of these badges, always visible, not
inferred from position or list membership:

`active_canonical` · `historical_attested` · `orphan_attested` ·
`superseded_operational` · `collision_preserved` · `quarantined` · `disputed`

### 3.5 Freshness and verification tier on every value

Distinguish visibly between:

- **Live** — computed on this page load, from the shared query layer (3.6)
- **Cached** — snapshot from `[timestamp]`, with the snapshot age shown
- **Independently audited** — links directly to the PR/workflow run that
  verified it (e.g., "verified via PR #611, 2026-07-13")

No value should be able to look more authoritative than its actual
provenance supports. This directly targets the "journal lock" failure mode —
a string presented with the visual weight of live telemetry that was
actually hardcoded copy.

### 3.6 One shared query layer — the actual root fix

This is the structural change that matters most, and it's not really a UI
change — it's what the UI change depends on. The audit scripts
(`audit-seal-hash-lineage.ts`, `audit-reserve-block-collisions.ts`), the
watchdog (`kv-watchdog`), the export tooling, and the UI's data-fetching
layer currently each implement their own traversal logic, with their own
assumptions about ID patterns, status filters, and sort order. Q1 became a
false alarm specifically because two of these (the original lineage audit
and, by extension, what the UI displayed) used an incomplete method that a
later, more careful method (PR #617/#618) didn't share.

**Proposal: extract one shared, well-tested traversal/query module** that
all of the above read through — audits, watchdog, export, and UI alike. If
the UI calls the same function the forensic scripts use, "the UI says X but
the audit says Y" becomes structurally impossible rather than something that
has to be caught by a human noticing a discrepancy.

**Candidate extraction points (implementation sketch):**

| Consumer | Current module | Shared module target |
|----------|----------------|----------------------|
| Lineage audit | `lib/dat/sealHashLineage.ts` | `lib/dat/reserveLineageQuery.ts` (proposed) |
| Collision audit | `lib/dat/reserveBlockCollisions.ts` | same |
| C-371 verification scripts | `scripts/c371-*.mjs` | call shared TS via `tsx` or port logic |
| KV watchdog | `lib/watchdog/kvHealthChecks.ts` | same |
| Canon export | `lib/dat/canonize.ts` | same (read path; export write path unchanged) |
| Vault / Canon Browser UI | ad-hoc API fetches | API route wrapping shared module |

### 3.7 Critical findings persist until explicitly resolved

Directly following from the tripwire-suppression concern raised earlier this
cycle: if `kv-watchdog` records a CRITICAL finding, the UI must continue
showing it as unresolved until an explicit resolution event closes it —
never auto-cleared by the next healthy poll. A critical state that can
silently disappear from the dashboard isn't functioning as a critical state,
regardless of what the backend logic intended.

---

## 4. What this does not include (deliberately out of scope)

- No change to sealing logic, block allocation, or the numbering scheme
  itself (that's the separate multi-lineage reconciliation architecture,
  already flagged in an earlier proposal as needing its own Tier 3
  ratification before implementation).
- No automatic reconciliation, merging, or "cleanup" of historical data —
  this proposal is about *displaying* the truth that already exists in
  canon, not changing what canon contains.
- No decision here about which lineage becomes canonical-going-forward for
  new blocks — that's a governance question (already answered: July chain is
  active), not a UI question.

---

## 5. Open questions for whoever implements this

- Does the shared query layer (3.6) get built as new infrastructure, or by
  extracting and generalizing the logic already proven correct in
  `audit-seal-hash-lineage.ts`? The latter seems lower-risk, since that
  script's methodology is what actually resolved Q1 correctly.
- Where does the "verification tier" metadata (3.5) actually get sourced
  from — does every value need a stored pointer to the PR/run that verified
  it, or is this computed at render time from some other signal?
- Should the era view (3.2) be the default landing view for the Vault/Canon
  pages, replacing the current flat list, or should it be an additional tab
  alongside the existing view during a transition period?
- Does this proposal's scope belong in `mobius-civic-ai-terminal` alone, or
  does the shared query layer need to also be consumed by tooling that lives
  in `Mobius-Substrate` (the `.dat` export path)? If the export tooling and
  the UI don't share the same layer, the same class of discrepancy could
  recur between "what the UI shows" and "what gets exported to cold canon."

---

## 6. Suggested implementation sequence (if ratified)

1. **Shared query module** — extract `reserveLineageQuery` with tests mirroring C-371 verification cases (legacy IDs, attested walk, collision pairs).
2. **Refactor audits + watchdog** — point existing tooling at shared module (no behavior change intended).
3. **API surface** — `GET /api/vault/reserve-lineage-summary` (or extend `/api/vault/seal` with `scope=lineage`) returning decomposed counts + era buckets.
4. **UI** — Vault chamber + Canon Browser era view, collision pairs, status badges, verification tier links.
5. **Critical finding persistence** — wire `kv-watchdog` CRITICAL state to UI with explicit resolution events.

---

## 7. Next step

This is a **design proposal**, not an EPICON-02 implementation intent — no
code has been written and no implementation PR opened. If this direction
looks right, the next step is drafting the actual EPICON-02 intent scoped
to implementation, following the same pattern used for the
[EVE KV watchdog proposal](../C-370/EPICON_C-370_EVE_kv-watchdog-proposal_v1.md).

---

*"We heal as we walk." — Mobius Systems*
