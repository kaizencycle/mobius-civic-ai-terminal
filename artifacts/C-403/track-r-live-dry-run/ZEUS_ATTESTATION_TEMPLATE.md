# ZEUS Attestation Template — Track R Batch (UNSIGNED)

**Capture ID:** `track-r-c403-2026-08-14T1725Z`  
**Semantic manifest hash:** `27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa`  
**Lineage snapshot hash (CAS gate):** `14c4af426af7d660f77a144ba4edbfc9285fa1bc2219bb08561a7c0b04e25dfb`  
**Telemetry snapshot hash (informational):** `605edbb303db3ecf2614b4e6f757ac1ce09ce57a053fb4be702365f00be5d1d8`  
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
