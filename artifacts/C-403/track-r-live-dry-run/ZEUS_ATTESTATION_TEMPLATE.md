# ZEUS Attestation Template — Track R Batch (UNSIGNED)

**Capture ID:** `track-r-c403-2026-08-14T1920Z`  
**Semantic manifest hash:** `27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa`  
**Lineage snapshot hash (CAS gate):** `2fba50aa07d4b79ba7891626b58a0be425088adc50ce3d48598ad894555cb8e7`  
**Execution witness hash:** `TBD`  
**Rollback manifest hash:** `0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d`  
**Telemetry snapshot hash (informational):** `20a7cb5f4a9f5d08d1735d9417104f0413c8f78eac1288712e26fb827f84e076`

## Verification checklist

- [ ] Semantic manifest hash recomputes identically (excludes created_at, verdicts, telemetry)
- [ ] Exact live affected-block set matches pinned contested universe (not collision count alone)
- [ ] Every collision represented (125 pairs; 123 contested positions)
- [ ] 125 losing candidates quarantined, not erased
- [ ] No fabricated 131→132 edge; 132–194 verified_unattached
- [ ] Boundary 41→42 passes on seal evidence
- [ ] Lineage snapshot hash matches attestation (not full telemetry snapshot)
- [ ] Execution witness hash recomputes from per-record live KV comparison
- [ ] Live seal witness: matched = expected universe, mismatched = 0, missing = 0, unexpected = 0
- [ ] Rollback restores precise pre-execution state

## Verdict (do not pre-fill)

- [ ] ADOPT
- [ ] CLARIFY
- [ ] QUARANTINE
- [ ] REJECT

**ZEUS signature / timestamp:** _pending_

**Notes:** Dry-run writes: 0; execution NOT AUTHORIZED
