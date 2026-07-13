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
| [`artifacts/C-371/legacy-mic-tranche-lineage-manifest.json`](../../../artifacts/C-371/legacy-mic-tranche-lineage-manifest.json) | Machine-readable legacy lineage summary |
