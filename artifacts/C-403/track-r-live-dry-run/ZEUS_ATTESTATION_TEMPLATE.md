# ZEUS Attestation Template — Track R Batch (UNSIGNED)

**Capture ID:** `track-r-c403-2026-08-14T1716Z`  
**Semantic manifest hash:** `27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa`  
**Lineage snapshot hash (CAS gate):** `3d383f13871e888d95c914b17ba3994770cd5130e8fecf5a0fa515bf154100d8`  
**Telemetry snapshot hash (informational):** `c4f53191b6efdbdacc3785d432a73243e3839de5cce58cb8fbf0a2fca2e710b8`  
**Rollback manifest hash:** `0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d`

## Verification checklist

- [ ] Semantic manifest hash recomputes identically (excludes created_at, verdicts, telemetry)
- [ ] Every collision represented (125 pairs; 123 contested positions)
- [ ] 125 losing candidates quarantined, not erased
- [ ] No fabricated 131→132 edge; 132–194 verified_unattached
- [ ] Boundary 41→42 passes on seal evidence
- [ ] Lineage snapshot hash matches attestation (not full telemetry snapshot)
- [ ] Live seal witness export required before execution (not satisfied by this package)
- [ ] Rollback restores precise pre-execution state

## Verdict (do not pre-fill)

- [ ] ADOPT
- [ ] CLARIFY
- [ ] QUARANTINE
- [ ] REJECT

**ZEUS signature / timestamp:** _pending_

**Notes:** Dry-run writes: 0; execution NOT AUTHORIZED
