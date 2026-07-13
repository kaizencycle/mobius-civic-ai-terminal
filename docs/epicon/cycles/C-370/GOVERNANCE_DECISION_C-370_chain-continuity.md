# Governance Decision — C-370 Chain Continuity & MIC Reconciliation

**Status:** OPEN — awaiting human governance decision  
**Authority required:** Seal quorum (ATLAS, ZEUS, EVE, JADE, AUREA) + human custodian (Michael)  
**Severity:** P0  
**Evidence source:** [`FINDINGS_C-370_chain-continuity-kv-audit.md`](./FINDINGS_C-370_chain-continuity-kv-audit.md), PR #611 workflow run (2026-07-13T00:00Z), `lineage-audit.json` / `collision-audit.json`  
**Investigation status:** COMPLETE — this document does not choose a resolution. It exists to force one.

**Related (filed context, not decisions):**

- [`NOTE_C-370_Michael-governance-no-reset.md`](./NOTE_C-370_Michael-governance-no-reset.md) — custodian position: C-359 not intentional; Upstash KV budget suspension + `vault:seal:latest` continuity loss
- [`MIC_RECONCILIATION_C-370_dropped-seals.md`](./MIC_RECONCILIATION_C-370_dropped-seals.md) — Question 3 lookup checklist (119 seals)

---

## How to use this document

Three questions below, in decision order. Each has evidence, and a set of resolution
options with no option pre-selected or recommended. Whoever holds the relevant
authority marks a decision, dates it, and signs it. Do not merge/close #380, #598,
#611, or #612 as fully resolved until Question 1 and Question 2 are both answered —
Question 3 can proceed in parallel since it's a data-lookup task, not a policy call.

---

## Question 1 — The orphan fragment

**Was the sequence-42–194 fragment (no genesis, `orphan_prev` on `seal-C-308-042`) a known, documented event, or is it unexplained data loss?**

### Evidence

- `seal-C-308-042`'s `prev_seal_hash` (`2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758`) does not match any of the 313 attested seals currently in KV.
- This fragment (`lineage-seal-C-332-194`) spans sequences 42–194 across cycles C-308→C-332, with **zero genesis seals** — meaning whatever it originally linked to is not merely on a different chain, it isn't in the attested set at all.
- This is the earliest and least-explained of the three components. Unlike the C-359 restart (which has an explicit genesis marker and could plausibly be an intentional decision point), this fragment reads as something upstream having been lost, truncated, or never migrated.

### Resolution options (none pre-selected)

- [ ] **(a) Documented event** — locate the original decision (EPICON entry, commit, cycle notes, or custodian record) explaining what happened before/around C-308, and attach it here as the closing evidence.
- [ ] **(b) Data loss, acknowledged** — declare this an integrity incident. Requires: incident write-up per Canon law ("no rollback without proof, operator consent, and preserved incident history"), and a decision on whether the orphaned 153 seals remain in canon as an unlinked, clearly-labeled fragment or are handled some other way.
- [ ] **(c) Insufficient information** — cannot currently be determined either way. Requires: what additional investigation (if any) is worth doing before deciding, or a decision to accept permanent uncertainty on this point and move forward regardless.

**Decision:** _______________________  
**Decided by:** _______________________  
**Date:** _______________________  
**Evidence/reasoning attached:** _______________________

---

## Question 2 — The C-359 restart and the uniqueness constraint

**Was the C-359 genesis restart itself intentional — and separately, should the pipeline's ability to re-seal the same `block_number` across 60+ cycles without a uniqueness check be treated as its own incident, regardless of the answer to the first part?**

These are two sub-questions. Answering the first does not answer the second.

### Evidence

- Two full lineages exist with independent genesis seals: Chain B (`seal-C-332-001` → `seal-C-358-131`, cycles C-332–C-358, 131 seals) and Chain C (`seal-C-359-001` → `seal-C-370-029`, cycles C-359–C-370, 29 seals).
- 119 of 313 total attested seals are `block_number` collisions with a counterpart elsewhere in KV. **All 119 are `seal_hashes_differ: true`** (genuinely different payloads, not duplicate transmissions of the same seal) and **all 119 have `kept_quorum: 5` and `dropped_quorum: 5`** — meaning both the kept and dropped version of every collided block were independently, fully signed by all five quorum agents at different times (gaps ranging from weeks to about a month between kept/dropped `sealed_at` timestamps).
- A bulk re-attestation cluster is separately confirmed: 283 seals, sequence range 1–194, all carrying an `attested_at` timestamp in the 2026-06-30T20:00 hour — consistent with a single mass operation, not organic sealing activity (`cron/reattest-seals` production logs for that window still pending — checklist item 4 partial).

### Filed operator context (not a decision)

Custodian has filed position that C-359 was **not** an intentional governance reset. ZEUS catalog shows `latest_seal_id=seal-C-358-129` on 2026-06-30, then `null` by 2026-07-01T00:01Z. Root-cause hypothesis: **Upstash KV exceeded max budget** during high-write activity (bulk re-attest), `vault:seal:latest` continuity lost while attested seals remained, compounded by missing `block_number` uniqueness. See [`NOTE_C-370_Michael-governance-no-reset.md`](./NOTE_C-370_Michael-governance-no-reset.md). **This context does not close sub-question 2a or 2b** — it is evidence for the decision-maker to weigh.

### Sub-question 2a — Was C-359 a documented restart?

### Resolution options

- [ ] **(a) Yes, documented** — attach the record (EPICON entry, migration doc, cycle notes) explaining the decision to restart genesis at C-359.
- [ ] **(b) No documentation found** — treat as undocumented until proven otherwise.
- [ ] **(c) Partially documented** — some record exists but doesn't fully explain the mechanics (e.g., explains *why* a restart happened but not why old seals remained re-sealable afterward).

**Decision:** _______________________

### Sub-question 2b — Regardless of 2a, is the missing uniqueness constraint its own incident requiring a fix?

### Resolution options

- [ ] **(a) Yes** — the pipeline should have enforced one seal per `block_number` from the start; this is a real gap, fix it going forward (this is likely already covered by the collision-detection work in #611/#612, but the *root cause* — why sealing allowed the collision in the first place — is a separate, still-open question this decision should explicitly assign to someone).
- [ ] **(b) No** — re-sealing the same block number was an accepted/expected behavior of the pre-C-359 pipeline design, and the current detection tooling is sufficient going forward without a root-cause fix.
- [ ] **(c) Needs more investigation** — specify what's needed to decide.

**Decision:** _______________________  
**Decided by:** _______________________  
**Date:** _______________________

---

## Question 3 — MIC reconciliation

**For each of the 119 dropped-but-fully-quorum-signed seals, was MIC (or any user-facing reward) ever credited against that `seal_id`?**

This is explicitly a yes/no lookup task per seal, not a policy question — see the companion
reconciliation checklist ([`MIC_RECONCILIATION_C-370_dropped-seals.md`](./MIC_RECONCILIATION_C-370_dropped-seals.md)) for the full list of
119 `dropped_seal_id` values and the query procedure.

### Why this can't be assumed

Dedupe discarding a seal record from the canon export does not imply any MIC credit tied to
that seal's original sealing event was reversed. If the mint/reward pipeline credited MIC at
seal-time (rather than only at canon-export time), those credits may still be live on an
agent's balance even though the seal itself no longer appears in the deduped canon.

### Resolution options (per finding, not per-question — see reconciliation checklist)

- [ ] **(a) No credits found** — none of the 119 dropped seals ever triggered a MIC credit. Close with no further action.
- [ ] **(b) Credits found, already reconciled** — some credits exist but were already caught and corrected by an existing mechanism (name it, cite the evidence).
- [ ] **(c) Credits found, unreconciled** — live MIC credits exist against dropped seals with no evidence of correction. Requires a follow-up decision on remediation (claw back, accept as sunk, something else) — do not decide the remediation method here; just confirm the finding.

**Decision:** _______________________  
**Decided by:** _______________________  
**Date:** _______________________  
**Reconciliation checklist result attached:** _______________________

---

## Sign-off

This decision is not final until at least Questions 1 and 2 are marked, dated, and signed
by the human custodian, with seal-quorum agents' concurrence noted if their review was
sought. Question 3 may close independently once the reconciliation checklist completes.

| Role | Name | Decision recorded | Date |
|---|---|---|---|
| Human custodian | Michael Judan | | |
| Seal quorum (if consulted) | ATLAS / ZEUS / EVE / JADE / AUREA | | |
