# Cycle C-371 — Predecessor Recovery & Carry-Forward

**Status:** Open — forensic task complete; governance disposition pending  
**Prior seal:** C-370 — DISPUTED / PARTIAL ([`SEAL_C-370_DISPUTED_partial-closing.md`](../C-370/SEAL_C-370_DISPUTED_partial-closing.md))  
**Opening justification:** C-370 carry-forward table § "What C-370 did not resolve" — Q1 orphan fragment

## Artifacts

| Document | Role |
|----------|------|
| [`FINDINGS_C-371_C307_predecessor-recovery.md`](./FINDINGS_C-371_C307_predecessor-recovery.md) | **P0 bounded search** — recover `seal-C-307-041`; hash comparison vs `seal-C-308-042.prev_seal_hash` |
| [`artifacts/C-371/c307-predecessor-search-manifest.json`](../../../artifacts/C-371/c307-predecessor-search-manifest.json) | Machine-readable evidence manifest |
| [`artifacts/C-371/seal-C-307-041.recovered.redacted.json`](../../../artifacts/C-371/seal-C-307-041.recovered.redacted.json) | Redacted structural extract (full body via read-only API) |

## Forensic result (2026-07-13)

**MATCH** — predecessor body recovered from production KV (`status: promoted`). Hash confirmed. C-307 block 41 → C-308 block 42 continuity proven.

**Custodian disposition:** [`NOTE_C-371_custodian-Q1-boundary-disposition.md`](./NOTE_C-371_custodian-Q1-boundary-disposition.md) — `orphan_prev` was false positive (attested-only audit). Status: `HISTORICAL_CONTINUITY_PROVEN_AT_C307_C308_BOUNDARY`.

| Document | Role |
|----------|------|
| [`VERIFICATION_C-371_adversarial-hash-check.md`](./VERIFICATION_C-371_adversarial-hash-check.md) | Independent re-verification (fresh API + double recompute) |
| [`EPICON_C-371_PROPOSAL_lineage-audit-historical-index_v1.md`](./EPICON_C-371_PROPOSAL_lineage-audit-historical-index_v1.md) | Audit index correction proposal (not implemented) |
