# Cycle C-371 — Predecessor Recovery & Multi-Agent Continuity Verification

**Status:** Open — multi-agent verification complete; custodian ratification pending  
**Prior seal:** C-370 — DISPUTED / PARTIAL ([`SEAL_C-370_DISPUTED_partial-closing.md`](../C-370/SEAL_C-370_DISPUTED_partial-closing.md))  
**Opening justification:** C-370 carry-forward table § "What C-370 did not resolve" — Q1 orphan fragment

## Multi-agent verification (C-371 quorum)

| Agent | Verdict | Document |
|-------|---------|----------|
| **ZEUS** | `PASS_WITH_HISTORICAL_GENESIS_SET` | [`VERIFICATION_C-371_ZEUS_full-reserve-lineage.md`](./VERIFICATION_C-371_ZEUS_full-reserve-lineage.md) |
| **ECHO** | `INDEX_VISIBILITY_INCOMPLETE` | [`VERIFICATION_C-371_ECHO_storage-and-index-continuity.md`](./VERIFICATION_C-371_ECHO_storage-and-index-continuity.md) |
| **JADE** | `SEMANTIC_RENAME_WITH_COMPATIBILITY` | [`VERIFICATION_C-371_JADE_reserve-semantic-continuity.md`](./VERIFICATION_C-371_JADE_reserve-semantic-continuity.md) |

**Joint manifest:** [`artifacts/C-371/reserve-lineage-verification-manifest.json`](../../../../artifacts/C-371/reserve-lineage-verification-manifest.json)  
**Final classification:** `HISTORICAL_RESERVE_CONTINUITY_VERIFIED` (pending EVE / AUREA / Custodian)

## Artifacts

| Document | Role |
|----------|------|
| [`FINDINGS_C-371_C307_predecessor-recovery.md`](./FINDINGS_C-371_C307_predecessor-recovery.md) | **P0 bounded search** — recover `seal-C-307-041`; hash comparison vs `seal-C-308-042.prev_seal_hash` |
| [`artifacts/C-371/c307-predecessor-search-manifest.json`](../../../../artifacts/C-371/c307-predecessor-search-manifest.json) | Machine-readable evidence manifest |
| [`artifacts/C-371/seal-C-307-041.recovered.redacted.json`](../../../../artifacts/C-371/seal-C-307-041.recovered.redacted.json) | Redacted structural extract (full body via read-only API) |

## Forensic results (2026-07-13)

| Task | Result | Doc |
|------|--------|-----|
| C-307-041 predecessor recovery | **MATCH** — boundary 41→42 proven | [`FINDINGS_C-371_C307_predecessor-recovery.md`](./FINDINGS_C-371_C307_predecessor-recovery.md) |
| Legacy MIC tranche blocks 1–41 | **RECOVERED IN KV** — correct `LEGACY_SEAL_KV_RESET_IDS` | [`FINDINGS_C-371_legacy-mic-tranche-lineage.md`](./FINDINGS_C-371_legacy-mic-tranche-lineage.md) |

**Custodian disposition:** [`NOTE_C-371_custodian-Q1-boundary-disposition.md`](./NOTE_C-371_custodian-Q1-boundary-disposition.md) — `orphan_prev` was false positive (attested-only audit).

**Correction:** Blocks 1–35 are **not** missing when queried by legacy seal IDs; earlier `seal-C-307-00N` pattern returned 404 because those IDs never existed.

| Document | Role |
|----------|------|
| [`FINDINGS_C-371_legacy-mic-tranche-lineage.md`](./FINDINGS_C-371_legacy-mic-tranche-lineage.md) | **Corrected** blocks 1–41 audit via `LEGACY_SEAL_KV_RESET_IDS` |
| [`artifacts/C-371/legacy-mic-tranche-lineage-manifest.json`](../../../../artifacts/C-371/legacy-mic-tranche-lineage-manifest.json) | Machine-readable legacy lineage summary |
| [`NOTE_C-371_AUREA-legacy-lineage-synthesis.md`](./NOTE_C-371_AUREA-legacy-lineage-synthesis.md) | **AUREA confirmed** — canonical topology and status model |
| [`VERIFICATION_C-371_adversarial-hash-check.md`](./VERIFICATION_C-371_adversarial-hash-check.md) | Independent re-verification (fresh API + double recompute) |
| [`EPICON_C-371_PROPOSAL_lineage-audit-historical-index_v1.md`](./EPICON_C-371_PROPOSAL_lineage-audit-historical-index_v1.md) | Audit index correction proposal (not implemented) |
