# EPICON Handoff — Cycle C-370 (continued)
**To:** AUREA
**From:** ATLAS (session custodian)
**Date:** 2026-07-12
**Custodian opener:** [`HANDOFF_C-370_Michael-to-ATLAS_opener.md`](./HANDOFF_C-370_Michael-to-ATLAS_opener.md) — original 20-item brief (items 1–20 + findings 21–25).
**Prior artifact:** [PR #597](https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/597) — `epicon(C-370): ratify MIC issuance doctrine, gate earnMIC on Fountain GI threshold` — **merged**.  
**Companion artifact:** [`EPICON_C-370_GOVERNANCE_mic-issuance-ratification_v1.md`](./EPICON_C-370_GOVERNANCE_mic-issuance-ratification_v1.md) — items 1–2 resolution record.

---

## What's already resolved (items 1–2 of the original 20)

The original C-370 handoff (Michael → ATLAS) listed 20 optimizations. Items 1 and 2 — ratifying `docs/protocols/mic/mic_issuance_protocol.md` out of its C-285 draft status, and gating `earnMIC` so it stops minting spendable MIC from provisional integrity scores below the Fountain threshold — are done in PR #597. Full justification, the doctrine text, and verification are in that PR's EPICON entry: `docs/epicon/cycles/C-370/EPICON_C-370_GOVERNANCE_mic-issuance-ratification_v1.md`.

**Correction to the record, discovered while resolving item 1:** the original handoff's "live telemetry" section treated the string `"ZEUS: EPICON feed empty, ECHO ingest blocked by journal lock"` as a direct ZEUS diagnostic and made clearing it C-370's top priority. That string is a hardcoded placeholder in `components/terminal/chambers/GlobeChapterDashboards.tsx` — it renders any time the seismic array is empty, regardless of cause. A second instance of the same pattern (`SentinelChamber.tsx`'s "ZEUS DISPUTE ROOT CAUSES" panel, hardcoded from C-324) was also found and corrected. **No journal lock mechanism exists anywhere in the ingest pipeline** — grepped the full ECHO/journal write path to confirm. The real, live-telemetry-confirmed issues as of 2026-07-12T12:02Z are: GI layer divergence (ATLAS 0.786 / integrity-status 0.773 / micro 0.903), `kv_keys_ok=false` persistent, a transient journal-KV-mirror write failure, and `/api/vault/attest` returning 404. Treat any future "journal lock" or similarly specific-sounding static UI copy in this codebase with suspicion until traced to a real signal — this repo has at least two confirmed instances of fabricated diagnostic text presented as live findings.

Items 21–22 from the original handoff's "Additional Findings": item 21 (`CURRENT_CYCLE.md` staleness) was already stale-checked and resolved by automation before this session started — confirmed fresh at C-370/GI 0.9 on session start, no action needed. Item 22 (confirm `lib/gi/compute.ts`'s "LOCKED" status is still intended) remains open — folded into item 8 below since it's the same GI-formula governance question.

---

## The remaining 18 items

These are items 3–20 of the original handoff's "20 Optimizations for C-370" list, unresolved. Numbering preserved from the original for traceability.

**3. CI structural check for score→MIC arithmetic pattern.** Extend `.github/workflows/epicon-guard.yml` / the `kaizencycle/epicon@v1` action so a PR touching a file that does direct `score * multiplier → MIC` arithmetic outside the ratified issuance-layer module fails the build. Not started. Note: `kaizencycle/epicon@v1` is an external action (separate repo, not in this session's scope) — this may need a companion change there, not just in this repo's policy JSON.

**4. Wire the ratified doctrine's full Vault + sustain + Fountain path, not just the instantaneous GI check.** PR #597's `earnMIC` gate uses a simple `gi.score >= 0.95` check. This repo already has a formal sustain tracker — merged PR #596 (`feat(c369): proposal-only Integrity Grade requests...`) added a `consecutiveGi95Cycles` sustain counter distinct from the 0.75-threshold counter. `earnMIC`'s gate should read from that tracker instead of instantaneous GI, so a single-poll GI spike above 0.95 can't trigger a mint before sustain is proven. Find the sustain tracker (likely under `lib/mfs/` or `lib/vault-v2/`, given PR #596's file list) and wire it in.

**5. Generate the missing `.dat` files for the 349 hot-KV-attested Reserve Blocks.** `canon/reserve-blocks/` is still empty in this checkout. The export/automation *infrastructure* already exists — merged PR #591 (`feat(canon): C-368 PR7 reserve canon export + continuous append lane`) added the GitHub Actions workflow, the `/api/cron/reserve-canon-append` cron, and `scripts/canonize-reserve-blocks.ts`. What's missing is execution: per PR #591's own "Operator next step," someone needs to configure `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `SUBSTRATE_GITHUB_TOKEN` as GitHub Actions secrets and run the workflow with `incremental: false` to prime the backlog. This is an operator action, not a code change — flag to Michael directly rather than trying to code around it.

**6. Scheduled integrity check comparing hot-KV attestation count against `canon/reserve-blocks/` file count.** Blocked on #5 landing first (nothing to compare against yet).

**7. Confirm the circuit breaker (GI < 0.85 or > 5%/epoch drop) actually fires.** Live GI has been reading 0.71–0.9 across recent ZEUS verification passes — closer to the 0.85 line than comfortable. Not verified whether the breaker has tripped or whether this is another spec-ahead-of-code gap like the original earnMIC issue.

**8. Ratify one canonical GI formula (DWE three-domain vs. DVA five-domain) via seal quorum.** Also resolves original item #22 (confirm `lib/gi/compute.ts`'s "LOCKED" status). Two live GI definitions is itself a Witness Principle violation per the original handoff's own framing — this needs an actual seal-quorum decision, not a unilateral code change.

**9. Investigate the GI layer divergence and repeated-content-signature pattern.** As of the last live ZEUS pass (`docs/catalog/zeus/2026-07-12T12-02-42Z-verification.json`): ATLAS catalog 0.786, `/api/integrity-status` 0.773, micro composite 0.903 — a ~0.13 spread between layers, flagged `fail` by ZEUS itself (`gi_layer_divergence`). The original handoff's "21% repeated content signatures" figure was not independently re-verified this session.

**10. Re-verify the CI git exit 128 fix held.** Not checked this session — needs a look at recent `Mobius Sync (Unified)` and related workflow run history.

**11. Confirm the unauthenticated OAA MIC mint path (flagged in C-368 PR briefs) is actually closed.** Not checked this session.

**12. Confirm GII threshold alignment to canon (C-368 brief item) is live, not just merged.** Not checked this session.

**13. Extend the `civicRoutes.ts`/`usePathView` History-API routing fix to the journal route, if not already applied.** Re-scope this before touching it: the original handoff bundled this with the (fictional) "journal lock" finding. Verify independently whether the journal route actually needs this routing fix on its own merits — don't assume the original bundling was correct just because item 3/14 turned out to be based on a real routing gap elsewhere.

**14. Close the HIVE write-back loop (`citizen_history` via ledger events).** HIVE reportedly remains broadcast-only — agent actions in the simulation layer don't feed back into the witness table. Not investigated this session.

**15. Re-audit MII (per-agent reputation) scoring for the 10 sentinel agents under degraded GI.** Confirmed in code this session: `components/terminal/chambers/GlobeChapterDashboards.tsx` has a `MOCK_MII_SCORES` fallback (ATLAS 0.81, ZEUS 0.64, EVE 0.74, JADE 0.85, AUREA 0.90, HERMES 0.49, ECHO 0.32, DAEDALUS 0.39) that renders when the live `miiMap` is empty — this is the same C-324 mock baseline the original handoff flagged from the Globe lane snapshot. It's a labeled fallback (`OPT-09` comment), not mislabeled as live data, so it's lower-severity than the two fabricated-diagnosis panels fixed in PR #597 — but confirm whether `miiMap` is actually populating in production before trusting any MII-based decision.

**16. Confirm the Upstash/Vercel KV cron normalization (`*/5–*/15` → `*/30`) has held.** Not checked this session; cost-driven fixes tend to silently revert under pressure.

**17. Re-run EPICON Guard's I1–I6 invariant check across all six federation repos.** Only `mobius-civic-ai-terminal` is in this session's repo scope — this needs to run from a session with access to the other five repos.

**18. Add an explicit audit-trail entry type for "canon/runtime contradiction," distinct from ordinary EPICON entries.** PR #597's EPICON entry used `epicon_type: "doctrine-ratification"` as the closest existing fit, but no first-class schema category for "doctrine and code diverged" exists yet. This is the second time in recent cycles a canon/code mismatch has needed an ad hoc write-up (DWE/DVA GI formula being the first, per the original handoff) — worth making structural rather than repeating the workaround each time.

---

## Also still open (not in the numbered 18, but load-bearing)

**Seal-quorum attestation on the item-1/2 fix itself.** The original handoff recommended ATLAS, ZEUS, EVE, JADE, and AUREA each explicitly attest to the earnMIC contradiction fix before C-370 seals, since C-369 sealed *with* the contradiction still live. No multi-agent attestation mechanism was exercised this session — PR #597 has gone through the repo's standard human-operator review gate (draft → ready for review), which is not the same as quorum attestation. If quorum attestation is a real, separate mechanism in this system (as opposed to a narrative device), it still needs to happen.

---

*"Let me update my consensus." — Mobius constitutional phrase for acknowledging new ground truth.*
