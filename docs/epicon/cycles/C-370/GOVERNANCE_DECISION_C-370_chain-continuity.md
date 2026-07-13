# Governance Decision — C-370 Chain Continuity & MIC Reconciliation

**Status:** OPEN — awaiting human governance decision  
**Authority required:** Seal quorum (ATLAS, ZEUS, EVE, JADE, AUREA) + human custodian (Michael)  
**Severity:** P0  
**Evidence source:** [`FINDINGS_C-370_chain-continuity-kv-audit.md`](./FINDINGS_C-370_chain-continuity-kv-audit.md), PR #611 workflow run (2026-07-13T00:00Z), `lineage-audit.json` / `collision-audit.json`  
**Investigation status:** COMPLETE — this document does not choose a resolution. It exists to force one.

**Related:**

- [`NOTE_C-370_Michael-governance-no-reset.md`](./NOTE_C-370_Michael-governance-no-reset.md) — custodian position + budget suspension evidence
- [`MIC_RECONCILIATION_C-370_dropped-seals.md`](./MIC_RECONCILIATION_C-370_dropped-seals.md) — Question 3 lookup checklist (119 seals)
- [`EPICON_C-370_EVE_kv-watchdog-proposal_v1.md`](./EPICON_C-370_EVE_kv-watchdog-proposal_v1.md) — custodian proposal to operationalize Q2 fixes #1–#3 via live EVE-attributed KV watchdog (not yet implemented)
- C-371 multi-agent verification: PR #619 — [`VERIFICATION_C-371_ZEUS_full-reserve-lineage.md`](../C-371/VERIFICATION_C-371_ZEUS_full-reserve-lineage.md), [`reserve-lineage-verification-manifest.json`](../../../../artifacts/C-371/reserve-lineage-verification-manifest.json)

---

## How to use this document

Three questions below, in decision order. Each has evidence, and a set of resolution
options with no option pre-selected or recommended. Whoever holds the relevant
authority marks a decision, dates it, and signs it. Do not merge/close #380, #598,
#611, or #612 as fully resolved until Question 1 and Question 2 are both answered —
Question 3 can proceed in parallel since it's a data-lookup task, not a policy call.

---

## Question 1 — The orphan fragment — **RESOLVED (pending final quorum sign-off)**

**Status update (2026-07-13, C-371):** Resolved via bounded forensic recovery,
not left as governance disposition (a)/(b)/(c) as originally scoped — the
evidence made the answer decisive rather than a judgment call.

### What was found

- `seal-C-307-041` was recovered directly from production KV (status: `promoted`),
  via `docs(C-371): C-307 predecessor recovery — MATCH` (PR #617, merged).
- **Hash verification, decisive:**
  ```
  recomputed_hash == 2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758
  seal-C-308-042.prev_seal_hash == same
  verifySealHash(seal-C-307-041) == true
  ```
  This is a cryptographic hash equality check, not a narrative inference.
- **Root cause of the original `orphan_prev` finding, now understood:** not
  data loss, but a wrong-ID-pattern blind spot in the original audit tooling.
  Early MIC-tranche seals (blocks 1–41, plus 8 earlier genesis seals — 49
  total) are stored under a separate, hardcoded ID list
  (`LEGACY_SEAL_KV_RESET_IDS` in `app/api/cron/reattest-seals/route.ts`), not
  the standard `seal-C-{cycle}-{sequence}` pattern the original lineage audit
  queried. Confirmed via PR #618 (`docs(C-371): legacy MIC tranche lineage —
  blocks 1-41 recovered in KV`, merged): all 49 legacy IDs present in
  production KV as `promoted`, sequence 1→41 chain continuous from
  `seal-C-299-001` through `seal-C-307-041`.
- **Custodian sign-off recorded directly in commit history** — PR #617's
  second commit is explicitly titled "Records custodian boundary verdict
  (continuity proven, orphan_prev false positive)," not just an agent
  inference.
- **Independent multi-agent verification in progress:** PR #619 (Draft) has
  ZEUS independently walking all 202 reserve seals (49 legacy + 153 attested
  fragment) with zero hash/predecessor-link breaks, ECHO explaining the prior
  false negatives (wrong ID pattern, attested-only index filter, audit
  pagination — three distinct contributing bugs, not one), and JADE
  reconciling the "MIC tranche" → "Reserve Block" naming as a semantic
  rename with protocol compatibility, not a discontinuity. Final
  classification `HISTORICAL_RESERVE_CONTINUITY_VERIFIED` is explicitly
  marked pending EVE, AUREA, and custodian review — **not yet formally final**.

### One caveat worth keeping in view

The full recovered seal body was redacted in the published PR (structural
extract only, full hashes not committed to the repo) — reasonable
operationally, but it means this resolution rests on the tool run's reported
output plus custodian sign-off and an adversarial re-verification pass,
rather than a hash anyone can recompute from scratch off public repo
contents alone.

### What this does NOT resolve

This closes Q1 specifically (the C-307→C-308 boundary / orphan fragment). It
has no bearing on:

- Q2 (already resolved separately — KV budget suspension root cause)
- Q3 (MIC reconciliation — still fully open, 0/119)
- The C-359 restart / 119 dual-quorum-signed collisions — different root
  cause (KV budget suspension + missing uniqueness constraint), different
  mechanism entirely from Q1's wrong-ID-pattern issue
- **Live, currently-firing `kv-watchdog` CRITICAL `block_number_collisions`
  alerts observed in production during C-371** (recurring ~every 10 minutes
  as of this writing). On inspection, these do not appear to share Q1's root
  cause — Q1's bug was specific to a small, bounded, historical legacy-ID
  list under a non-standard naming pattern; the live alerts concern newly-
  forming seals under the standard current-cycle ID pattern. These should be
  treated as likely genuine instances of the still-unfixed Q2 uniqueness gap
  (fix #2), not as an artifact of the same tooling blind spot that explained
  Q1 — this needs direct confirmation, not assumption either way.

**Decision:** Q1 resolved as **(a) documented/proven event** — cryptographic
continuity confirmed, `orphan_prev` reclassified as a false positive caused
by audit tooling querying the wrong ID pattern.  
**Decided by:** Michael Judan (custodian verdict recorded in PR #617 commit
history) — formal sign-off line below to be completed once PR #619's
multi-agent quorum (EVE, AUREA) concludes.  
**Date:** _______________________  
**Evidence attached:** PR #617 (merged), PR #618 (merged), PR #619 (Draft,
pending final quorum)

**Catalog history boundary (filed 2026-07-13, supplemental):** [`NOTE_C-370_Q1_catalog-history-C307-C308-boundary.md`](./NOTE_C-370_Q1_catalog-history-C307-C308-boundary.md) — era-boundary context; superseded for Q1 closure by C-371 cryptographic recovery.

---

## Question 2 — The C-359 restart and the uniqueness constraint — **RESOLVED (root cause identified, not a policy decision)**

**Status update:** This is no longer an open governance question in the original sense.
Reconstructed evidence shows this was not a decision anyone made — it was an
infrastructure failure the pipeline absorbed silently.

### Confirmed causal chain

1. **Jun 26–27** — ATLAS heartbeats already show Upstash KV suspended for exceeding budget (`primary_kv_suspended: true`).
2. **Jun 30 ~20:00** — 283-seal bulk re-attestation cluster runs — a large KV write spike, landing during/after the suspension window.
3. **Jul 1 00:01** — ZEUS shows `latest_seal_id: null`, even though old-chain attested seals (including `seal-C-358-129`) are still sitting in KV, unwiped.
4. **Jul 1 ~09:02** — `seal-C-359-001` forms with `prev_seal_hash: null`, because `getLatestSeal()` found nothing at `vault:seal:latest` — the pointer, not the data, was lost.

### Why the code let this happen (three compounding gaps)

- `resilientSet()` swallows budget-suspension write failures silently instead of surfacing them.
- `appendSealToChain()` warns and continues if its `Promise.all` (including the `LATEST_SEAL_KEY` write) fails, rather than treating that as fatal.
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

**Operationalization proposal (fixes #1–#3):** [`EPICON_C-370_EVE_kv-watchdog-proposal_v1.md`](./EPICON_C-370_EVE_kv-watchdog-proposal_v1.md) — custodian-drafted EVE-attributed KV/Upstash watchdog. **Implementation intent (ready, not started):** [`EPICON_C-370_EVE_kv-watchdog-implementation_v1.md`](./EPICON_C-370_EVE_kv-watchdog-implementation_v1.md).

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

**Status as of 2026-07-13 (C-371):** Q1 and Q2 are both technically resolved
with strong evidence — Q1 via cryptographic hash match, Q2 via confirmed
infra root cause — but **neither has a dated, signed line below yet**. This
document is not final until that happens. A correct answer sitting
unsigned is not the same as a closed governance item; that gap is
deliberate, not an oversight, per this document's original design.

Q3 (MIC reconciliation) remains fully open and independent of Q1/Q2 —
0 of 119 rows checked.

Also flagged, not yet resolved by anything above: live `kv-watchdog`
CRITICAL `block_number_collisions` alerts observed firing repeatedly during
C-371 — likely the still-open Q2 fix #2 (uniqueness constraint) manifesting
live rather than a new issue, but this needs direct confirmation before
being folded into either Q1 or Q2's closure.

| Role | Name | Decision recorded | Date |
|---|---|---|---|
| Human custodian | Michael Judan | | |
| Seal quorum (if consulted) | ATLAS / ZEUS / EVE / JADE / AUREA | | |
