# Governance Decision — C-370 Chain Continuity & MIC Reconciliation

**Status:** PARTIAL — Q2 root cause reconstructed (pending custodian accept); Q1 and Q3 OPEN  
**Authority required:** Seal quorum (ATLAS, ZEUS, EVE, JADE, AUREA) + human custodian (Michael)  
**Severity:** P0  
**Evidence source:** [`FINDINGS_C-370_chain-continuity-kv-audit.md`](./FINDINGS_C-370_chain-continuity-kv-audit.md), PR #611 workflow run (2026-07-13T00:00Z), `lineage-audit.json` / `collision-audit.json`  
**Investigation status:** COMPLETE — Q2 reframed as infra incident (not governance fork); Q1 and Q3 still require human sign-off

**Related:**

- [`NOTE_C-370_Michael-governance-no-reset.md`](./NOTE_C-370_Michael-governance-no-reset.md) — custodian position + budget suspension evidence
- [`MIC_RECONCILIATION_C-370_dropped-seals.md`](./MIC_RECONCILIATION_C-370_dropped-seals.md) — Question 3 lookup checklist (119 seals)
- [`EPICON_C-370_EVE_kv-watchdog-proposal_v1.md`](./EPICON_C-370_EVE_kv-watchdog-proposal_v1.md) — custodian proposal to operationalize Q2 fixes #1–#3 via live EVE-attributed KV watchdog (not yet implemented)

---

## How to use this document

Three questions below, in decision order. Question 2 is **resolved as a technical
reconstruction** (infra failure, not a policy fork) — pending Michael's date/sign-off.
Question 1 still requires a governance decision. Question 3 can proceed in parallel
(data lookup, not policy).

Do not merge/close #380, #598, #611, or #612 as fully resolved until **Question 1**
is answered and **Question 2** is accepted/signed by the custodian. Question 3 may
close independently once the reconciliation checklist completes.

---

## Question 1 — The orphan fragment

**Was the sequence-42–194 fragment (no genesis, `orphan_prev` on `seal-C-308-042`) a known, documented event, or is it unexplained data loss?**

### Evidence

- `seal-C-308-042`'s `prev_seal_hash` (`2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758`) does not match any of the 313 attested seals currently in KV.
- This fragment (`lineage-seal-C-332-194`) spans sequences 42–194 across cycles C-308→C-332, with **zero genesis seals** — meaning whatever it originally linked to is not merely on a different chain, it isn't in the attested set at all.
- This is the earliest and least-explained of the three components. Unlike the C-359 fracture (explained below as infra failure), this fragment reads as something upstream having been lost, truncated, or never migrated.

**Catalog history boundary (filed 2026-07-13):** [`NOTE_C-370_Q1_catalog-history-C307-C308-boundary.md`](./NOTE_C-370_Q1_catalog-history-C307-C308-boundary.md) — custodian pointer to [`docs/catalog/history/index.json`](../../../catalog/history/index.json) line ~1341. Summary:

| Signal | Detail |
|--------|--------|
| Calendar catalog flip | C-307 → C-308 at `2026-05-11T07:51:45Z` (first C-308 snapshot: `20260511T075145Z.json`) |
| Orphan seal timestamp | `seal-C-308-042` sealed `2026-05-11T07:51:02.451Z` — **43s earlier**, same boundary window |
| Legacy list terminus | `LEGACY_SEAL_KV_RESET_IDS` ends at `seal-C-307-041` (block 41); orphan fragment starts at block 42 (`seal-C-308-042`) |
| Collision gap | Blocks 30–41 have no collision pairs in current KV; blocks 1–29 and 42+ do — consistent with missing May-era seq 1–41 while Jun-era Chain B holds 30–41 |

This narrows the orphan to an **era-boundary disconnect** at C-307→C-308 / block 41→42; it does **not** close Q1 — custodian must still choose (a) documented event, (b) acknowledged data loss, or (c) insufficient information.

### Resolution options (none pre-selected)

- [ ] **(a) Documented event** — locate the original decision (EPICON entry, commit, cycle notes, or custodian record) explaining what happened before/around C-308, and attach it here as the closing evidence.
- [ ] **(b) Data loss, acknowledged** — declare this an integrity incident. Requires: incident write-up per Canon law ("no rollback without proof, operator consent, and preserved incident history"), and a decision on whether the orphaned 153 seals remain in canon as an unlinked, clearly-labeled fragment or are handled some other way.
- [ ] **(c) Insufficient information** — cannot currently be determined either way. Requires: what additional investigation (if any) is worth doing before deciding, or a decision to accept permanent uncertainty on this point and move forward regardless.

**Decision:** _______________________  
**Decided by:** _______________________  
**Date:** _______________________  
**Evidence/reasoning attached:** _______________________

---

## Question 2 — The C-359 restart and the uniqueness constraint — **RESOLVED (root cause identified, not a policy decision)**

**Status update:** This is no longer an open governance question in the original sense.
Reconstructed evidence shows this was not a decision anyone made — it was an
infrastructure failure the pipeline absorbed silently.

### Confirmed causal chain

1. **Jun 26–27** — ATLAS heartbeats already show Upstash KV suspended for exceeding budget (`primary_kv_suspended: true`). See e.g. `docs/catalog/heartbeats/2026-06-27T23-04-56Z-atlas.json`.
2. **Jun 30 ~20:00** — 283-seal bulk re-attestation cluster runs — a large KV write spike, landing during/after the suspension window.
3. **Jul 1 00:01** — ZEUS shows `latest_seal_id: null`, even though old-chain attested seals (including `seal-C-358-129`) are still sitting in KV, unwiped. See `docs/catalog/zeus/2026-07-01T00-01-30Z-verification.json`.
4. **Jul 1 ~09:02** — `seal-C-359-001` forms with `prev_seal_hash: null`, because `getLatestSeal()` found nothing at `vault:seal:latest` — the pointer, not the data, was lost.

### Why the code let this happen (three compounding gaps)

- `resilientSet()` (`lib/substrate/resilientWrite.ts`) swallows budget-suspension write failures silently instead of surfacing them.
- `appendSealToChain()` (`lib/vault-v2/store.ts`) warns and continues if its `Promise.all` (including the `LATEST_SEAL_KEY` write) fails, rather than treating that as fatal.
- No `block_number` uniqueness constraint — when sealing resumed with a lost pointer, it restarted at block 1 on what became a second, parallel chain instead of erroring.

### Sub-question 2a — Was C-359 a documented restart?

**Answer: N/A — reframe rejected.** There was no decision to document. This was not
a governance fork; it was silent infra failure. Do not treat "no documentation found"
as unexplained — it's explained, just not by a decision.

### Sub-question 2b — Is this its own incident requiring a fix?

**Answer: Yes — confirmed, not hypothetical.** Four concrete fixes, in rough priority order:

1. **Make `LATEST_SEAL_KEY` write failure fatal**, not a warn-and-continue — a seal chain cannot safely proceed without confirming its own pointer wrote successfully.
2. **Add `block_number` uniqueness constraint** at seal time, not just at export/dedupe time — this is what actually let sequence numbers restart silently.
3. **KV budget headroom** — check whether the earlier cron-normalization fix (`*/5–*/15` → `*/30`) actually held, or whether this Jun 26–30 suspension is a second, distinct budget exhaustion event, possibly driven by the bulk re-attest write volume itself.
4. **Batch re-attestation more gently** — if the 283-seal spike itself contributed to pushing KV over budget, this and #3 may be the same fix.

**Operationalization proposal (fixes #1–#3):** [`EPICON_C-370_EVE_kv-watchdog-proposal_v1.md`](./EPICON_C-370_EVE_kv-watchdog-proposal_v1.md) — custodian-drafted EVE-attributed KV/Upstash watchdog. **Implementation intent (ready, not started):** [`EPICON_C-370_EVE_kv-watchdog-implementation_v1.md`](./EPICON_C-370_EVE_kv-watchdog-implementation_v1.md) — Q2 sealing fixes and hard-stop remain explicitly out of scope or gated.

**Still genuinely open:** whether item 4 on the original checklist (`cron/reattest-seals`
runtime logs confirming this write pattern) can be fully closed — the lineage audit
workflow can only supply KV-side evidence, not runtime log confirmation.

**Decided by:** ATLAS (technical reconstruction) — Michael to confirm/accept this as the closing account.  
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

Governance is not final until **Question 1** is marked, dated, and signed by the human
custodian, and **Question 2** is accepted/signed (technical reconstruction complete;
custodian date pending). Question 3 may close independently once the reconciliation
checklist completes.

| Role | Name | Decision recorded | Date |
|---|---|---|---|
| Human custodian | Michael Judan | Q1: ___ / Q2 accept: ___ / Q3: ___ | |
| Seal quorum (if consulted) | ATLAS / ZEUS / EVE / JADE / AUREA | Q2 reconstruction filed | 2026-07-13 |
