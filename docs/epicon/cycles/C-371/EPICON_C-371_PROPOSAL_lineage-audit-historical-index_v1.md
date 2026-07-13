# EPICON C-371 Proposal — Lineage Audit Historical Index Correction

**Status:** Proposal — not implemented  
**Trigger:** C-371 forensic recovery proved `orphan_prev` on `seal-C-308-042` was a **false positive** caused by attested-only traversal  
**Evidence:** [`FINDINGS_C-371_C307_predecessor-recovery.md`](./FINDINGS_C-371_C307_predecessor-recovery.md)

---

## Problem

`analyzeSealHashLineage()` (`lib/dat/sealHashLineage.ts`) filters to `status === 'attested'` before walking `prev_seal_hash` links. Predecessors with `status: promoted` (v1 legacy migration era) exist in KV at `vault:seal:{seal_id}` but are invisible to the audit.

**Observed failure mode:**

```
predecessor_present_outside_selected_index
  misreported as → orphan_prev / ATTESTED_ORPHAN_FRAGMENT
```

Mobius currently has at least two truth-bearing seal populations:

| Population | Typical status | Index |
|------------|----------------|-------|
| Operational attested chain | `attested` | `vault:seals:index:attested` |
| Historical promoted legacy | `promoted` | Individual keys only — not in attested index |

An audit that treats only attested seals as chain history can produce false orphan findings even when storage continuity is intact.

---

## Proposed correction (do not merge populations silently)

### Historical chain resolution

When resolving `prev_seal_hash` for lineage analysis, query **historical chain candidates**:

- `attested`
- `promoted`

Use `getSeal(prev_hash)` or a unified all-finalized seal list (`listAllSeals` / `vault:seals:index:all`) for predecessor lookup — not attested index alone.

### Operational active chain (unchanged)

Active-lineage rules, fountain gates, and cold-canon export may continue to scope to `attested` only. This proposal does not equate `promoted` with current operational attestation.

### Audit output taxonomy

Replace single `orphan_prev` with explicit link-issue types:

| Issue type | Meaning |
|------------|---------|
| `predecessor_missing_from_storage` | `prev_seal_hash` set, no seal body in KV at any status |
| `predecessor_present_outside_selected_index` | Body exists but was excluded by index filter (legacy) |
| `predecessor_status_promoted` | Predecessor found with `status: promoted` |
| `predecessor_hash_mismatch` | Body found but `seal_hash` does not match `prev_seal_hash` |
| `true_orphan_prev` | Reserved: predecessor genuinely absent after full historical lookup |

C-370 `orphan_prev` on `seal-C-308-042` would reclassify to `predecessor_status_promoted` (or `predecessor_present_outside_selected_index`).

---

## Boundaries

- **In scope:** `lib/dat/sealHashLineage.ts`, `scripts/audit-seal-hash-lineage.ts`, lineage audit workflow output schema
- **Out of scope:** Rewriting seal statuses, pointer repair, dedup rules, governance Q1 option selection, multi-lineage architecture ratification
- **Do not:** Silently treat `promoted` as ordinary current `attested` in operational paths

---

## Implementation sketch (future PR)

1. Add `resolvePredecessorSeal(sealsByHash, prevHash)` that checks attested set **and** falls back to `getSeal` by hash or ID lookup table built from `listAllSeals`.
2. Emit `link_issues[].issue` with new taxonomy; keep `orphan_prev` as deprecated alias with migration note.
3. Update `tests/contract/sealHashLineage.test.ts` with fixture: attested child → promoted parent (C-307/C-308 boundary case).
4. Re-run lineage audit workflow; confirm `seal-C-308-042` no longer reports false orphan.

---

## Counterfactuals

- If promoted seals must never participate in historical walks, document that explicitly and accept that boundary continuity requires a separate forensic task (as C-371 did) — do not claim attested-only audits are complete chain history.
- If multiple bodies share a hash, quarantine and report — do not auto-merge.
