# Human Custodian Consent — Track R Capture #9 v2 Governance Candidate

**Cycle:** C-404

> **THIS TEMPLATE IS UNSIGNED.** It records what a future consent, if given,
> must bind to. It is not itself a consent. Do not sign until ZEUS and EVE
> have both independently ADOPTed using the templates in this directory.
> The v2 execution-witness hash below was computed by the custodian
> (kaizencycle) running the reviewed verifier tool against the real
> extracted artifacts — see `TRACK_R_V2_VERIFICATION_STATUS.md` for the
> provenance chain. Verbatim raw-artifact archival is still outstanding;
> confirm it is complete before signing.

---

## Binding scope

A signed consent using this template binds to, and only to:

- **Capture #9 immutable archive path:** `artifacts/C-404/track-r-lineage-v2/history/capture-2014Z/` (verbatim artifact contents must be present here before signing — as of this packet, only a provenance record is present, not the verbatim artifact; see status doc)
- **Capture #9 artifact digest:** `sha256:5a4e344a706a431892f650c63dc48d7cbaf953bdb20e5a16ba6f66d7d1da4b6d`
- **Source commit:** `daeec8f3adb2716879ef773e5d9a63905f402050`
- **Complete v2 hash packet:**
  - `lineage_snapshot_version`: `v2`
  - `lineage_snapshot_hash`: `b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb`
  - `semantic_manifest_hash`: `27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa`
  - `execution_witness_hash` (v2): `e08999decbcdaaac06d91a9a11f06e6737756a646800db90ad8e57b865c1ccf1`
  - `rollback_manifest_hash`: `0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d`
- **Exact Track R repair manifest** in force at the time of signing (unchanged by this packet)
- **One-shot mutation scope** — a single, non-repeating authorization; does not carry forward to any future capture
- **Dual fresh v2 CAS requirement** — production mutation, if ever authorized separately, must re-verify the v2 lineage hash immediately before the mutation window, independent of this consent
- **Mandatory rollback** — a verified rollback plan must exist and be referenced before any mutation this consent might eventually gate
- **Mandatory post-write watchdog** — any future mutation this consent might gate requires a post-write watchdog audit
- **Explicit exclusion of Step 8 and sequence 361** — this consent does not authorize boundary 131→132 resolution or sequence 361 promotion under any circumstance
- **Automatic abort on any mismatch** — if the v2 CAS re-check at mutation time does not match the hash bound above, any action this consent might gate must abort automatically, not proceed with operator override

## Explicit non-authorization

This consent template, even once signed, does **not** by itself:

- Authorize production KV mutation
- Set `execution_authorized: true`
- Set `TRACK_R_BATCH_EXECUTION_ENABLED=true`
- Clear the integrity gate
- Form a candidate
- Seal reserve blocks
- Activate the Fountain
- Promote sequence 361
- Resolve boundary 131→132 or Step 8
- Reuse Capture #5's prior consent for any purpose

A separate, explicit one-shot execution handoff (per the CAS-v2 repair
handoff's Governance Restart section) is required after this consent, ZEUS
ADOPT, and EVE ADOPT are all in place, immediately before any mutation
window, with a fresh operator CAS probe run immediately before it.

---

**Signed by:** _(unsigned)_
**Date:** _(unsigned)_
**Signed attestation artifact path:** _(unsigned)_
