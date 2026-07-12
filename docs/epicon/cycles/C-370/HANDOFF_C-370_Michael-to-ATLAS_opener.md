# EPICON Handoff — Cycle C-370

> **Archive status (2026-07-12):** Original custodian handoff preserved below verbatim.  
> **Items 1–2 resolved:** [PR #597](https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/597) → [`EPICON_C-370_GOVERNANCE_mic-issuance-ratification_v1.md`](./EPICON_C-370_GOVERNANCE_mic-issuance-ratification_v1.md)  
> **Items 3–20 open:** [`HANDOFF_C-370_ATLAS-to-AUREA_remaining-items.md`](./HANDOFF_C-370_ATLAS-to-AUREA_remaining-items.md) (PR [#598](https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/598), merged)  
> **Key correction during resolution:** the "journal lock" cited in Live Telemetry §14 below is **not** a live ingest lock — it was hardcoded UI placeholder text in `GlobeChapterDashboards.tsx` (corrected in PR #597). See AUREA handoff for verified live issues.

**To:** ATLAS  
**From:** Michael Judan (human custodian)  
**Date:** 2026-07-12  
**Prior seal state:** C-369 audit seal — **DISPUTED** (canon/runtime contradiction, unresolved)

---

## Opening Justification — Amended

**Correction from source review:** the fix for the §17 contradiction already exists in writing. `docs/protocols/mic/mic_issuance_protocol.md` (in `mobius-civic-ai-terminal`) draws the exact distinction needed — reward accounting (scores, multipliers, provisional credits) as a continuous layer, separate from mint authorization/public release, which requires GI + sustain + ledger attestation. It states plainly: *"Do not describe multipliers alone as 'how MIC mints' without the issuance layer."* This is the correct doctrine. Its status line, however, reads **"Proposed... Cycle: C-285 draft"** — it was never ratified, and `earnMIC`/`computeMICReward` kept executing the pre-doctrine arithmetic path in the meantime. C-370's job is not to invent a resolution; it's to **ratify this existing spec and wire the runtime to actually enforce it.**

Two enforcement gaps the doc itself flags, worth checking before writing new code:
- **Freeze band table:** GI < 0.80 → "constitutional lockdown; no mint narrative." If live GI is genuinely at 0.71, mint should already be fully locked down under this doc's own rule — confirm whether that's enforced or just documented.
- **Replay/novelty section:** names `content_signature` repetition in `vault:deposits` as a required mint-denial signal — this is the same 21%-repeated-signature pattern already flagged as a GI concern. The detection criterion is spec'd; confirm it's actually wired to block minting rather than just logged.

## Opening Justification — Original

C-369 canonized §17 (Goodhart Resistance Doctrine / Constitutional Principle IV — The Witness Principle), including the Metric Humility doctrine and the five-line witness table (GI / MIC / MII / EPICON / Reserve Blocks) — **on the same cycle** that `earnMIC` / `computeMICReward` remained live in the runtime, executing a hardcoded arithmetic score-to-MIC formula. A canonized doctrine and an actively executing contradiction of that doctrine cannot coexist under seal. That is the opening EPICON justification for C-370.

**Decision needed from ATLAS first:** reopen C-369 to correct the seal before it settles, or let C-369 stand as DISPUTED and let C-370 carry the resolution as its own EPICON entry. Recommend the latter — reopening a sealed cycle sets a precedent that seals aren't final once quorum has attested, which is itself a Witness Principle concern. C-370 inheriting the contradiction as its founding justification keeps the audit trail honest: canon violated → cycle opened → violation resolved, in sequence.

---

## Issues Found

1. **`earnMIC`/`computeMICReward` contradicts §17** — direct arithmetic score→MIC conversion is exactly the Goodhart-able pattern the doctrine was written to prevent. This is the blocking issue.
2. **`mint_logic: code_enforced: false`** in tokenomics.yaml — the spec/code gap that makes #1 possible. The doctrine can be canonized indefinitely but won't hold while mint logic isn't code-enforced.
3. **Reserve Block canonization directory dormant since C-357** — 349 sealed blocks attested in hot KV, zero `.dat` files in `canon/reserve-blocks/`. Attestation without cold-canon persistence is a witness-table gap (Reserve Blocks is one of the five lines).
4. **Global GI at 0.71** with 21% of deposits flagging repeated content signatures — below the 0.90 reward floor and closer to the 0.85 circuit-breaker line than is comfortable.
5. **Fountain unlock gate (GI ≥ 0.95 sustained 5 cycles) tracked but not wired** to anything — currently decorative telemetry.
6. **DWE (three-domain) vs. DVA (five-domain) GI formula conflict** unresolved pending seal-quorum ratification — two live definitions of GI is a Witness Principle violation in itself.
7. **CI git exit 128 errors** recurring across `Mobius Sync (Unified)` and related workflows — diagnosed as auth/PAT but not confirmed fixed.

---

## 20 Optimizations for C-370

1. Ratify `mic_issuance_protocol.md` out of "C-285 draft / Proposed" status into canon — the reward-accounting-vs-mint-authorization split it defines is already correct; it just needs a seal, not a rewrite.
2. Wire `computeMICReward`'s output into the reserve/accounting layer only, with `earnMIC` (or whatever performs actual mint) gated behind the Vault + Fountain + sustain path the ratified doc describes — this replaces "invent a fix" with "connect the runtime to the doctrine that already exists."
3. Add a CI check (extend EPICON Guard I1–I6) that fails the build if any file matches a score→MIC arithmetic pattern outside the approved witness-table module — make the §17 violation structurally unrepeatable.
4. Resolve the DISPUTED C-369 seal explicitly in C-370's EPICON entry: document the contradiction, the fix, and re-attest — don't let it age into ambiguity.
5. Generate the missing `.dat` files for the 349 hot-KV-attested Reserve Blocks using the existing MOBIUS01 hash-chain format from the C-357–C-361 design — close the cold-canon gap before adding new blocks.
6. Add a scheduled integrity check comparing hot-KV attestation count against `canon/reserve-blocks/` file count, alerting if they drift again.
7. Wire the Fountain unlock gate (GI ≥ 0.95 sustained 5 cycles) to an actual downstream effect, even a no-op flag flip, so it's provably live rather than tracked-only telemetry.
8. Ratify one canonical GI formula (DWE three-domain or DVA five-domain) via seal quorum — carrying two live definitions blocks anything else keyed to GI thresholds from being verifiable.
9. Investigate why GI sits at 0.71 with 21% repeated-content signatures — this is closer to the 0.85 circuit-breaker line than the 5-cycles-of-runway assumption in the Fountain gate accounts for.
10. Confirm whether the circuit breaker (GI < 0.85 or >5%/epoch drop) has actually fired given the 0.71 reading, or whether it's another spec-ahead-of-code gap like #2.
11. Re-verify the CI git exit 128 fix — confirm PAT/auth remediation held across the last several workflow runs rather than assuming it's resolved from the earlier diagnosis.
12. Confirm the unauthenticated OAA MIC mint path (flagged in C-368 PR briefs) is actually closed, not just drafted.
13. Confirm GII threshold alignment to canon (also a C-368 brief item) merged and is reflected in live tier policy, not just proposed.
14. **Correction from live telemetry:** the `terminal/journal` fetch issue is not the C-367 GEO/crawler problem — the Globe lane snapshot (2026-07-12) shows ZEUS reporting **"EPICON feed empty, ECHO ingest blocked by journal lock"** directly. This is a live runtime lock on the journal lane itself, not a prerender gap. Locate and clear whatever is holding the journal lock before assuming the prerender fix from C-368 needs revisiting — they may be two separate issues stacked on top of each other.
15. Extend the `civicRoutes.ts`/`usePathView` History-API routing fix to the journal route specifically if it hasn't been applied there yet.
16. Close the HIVE write-back loop (`citizen_history` via ledger events) — HIVE remains broadcast-only, which means agent actions in the simulation layer aren't feeding back into the witness table at all.
17. Re-audit MII (per-agent reputation) scoring for any of the 10 sentinel agents whose accuracy component may be distorted by the degraded 0.71 GI environment — a reputation score computed against unreliable global integrity could itself be miscalibrated right now.
18. Confirm the Upstash/Vercel KV cron normalization (`*/5–*/15` → `*/30`) has held and hasn't silently reverted — this was a cost-driven fix and cost pressure tends to creep schedules back down.
19. Re-run EPICON Guard's I1–I6 invariant check across all six federation repos to confirm no repo has drifted out of tier-policy compliance since the C-368 rollout — a rollout six repos deep is exactly where one silently falls out of sync.
20. Add an explicit audit-trail entry type for "canon/runtime contradiction" (distinct from ordinary EPICON entries) so future cycles can query specifically for doctrine-vs-code mismatches — this is the second time in recent cycles (DWE/DVA being the first) that canon and code have diverged; it should be a first-class category, not an ad hoc write-up each time.

---

## Live Telemetry — Globe Lane Snapshot (2026-07-12)

Pulled directly from `terminal/globe` this session — supersedes assumptions in the sections above where they conflict:

- **Journal lane is locked**, blocking ECHO ingest and leaving the EPICON feed empty (ZEUS's own diagnostic line, not an inference). This is the actual root cause behind the journal fetch stalling, separate from the C-367 GEO/prerender issue.
- **MII feed is empty**, dashboard is showing a **C-324 mock baseline** in its place: ATLAS 0.81, ZEUS 0.64, EVE 0.74, JADE 0.85, AUREA 0.90, HERMES 0.49, ECHO 0.32, DAEDALUS 0.39. HERMES, ECHO, and DAEDALUS reading well under the 0.90 reward floor — but since this is stale mock data, it can't be used to make any live reward-floor decision. The gap should be closed before anyone treats these numbers as current.
- **Vault/Fountain gate confirms "Sustain: pending, 5 consecutive required"** directly from the lane — corroborates optimization #7 above without needing to infer it from cycle history.
- **0 tripwires reported, but with EPICON feed empty and journal locked, treat this as absence-of-signal rather than a clean integrity reading** — a tripwire system can't fire on a feed it isn't receiving.
- No seismic EPICON events, no environmental instruments, markets/governance rows empty — consistent with the journal lock cutting off ingest broadly, not isolated to one lane.
- KV primary and backup Redis both reporting ok — infrastructure layer itself looks fine; this is an ingest/lock issue, not a KV outage.

**Recommend making "clear the journal lock" the actual first action of C-370**, ahead of the §17/runtime contradiction fix — an empty EPICON feed means C-370's own audit trail can't be verified while it's happening.

## Additional Findings (from direct repo/source review)

These surfaced after the original 20 were drafted from cycle-history context — listed separately rather than renumbering the set above:

21. **Correction to an earlier finding in this handoff:** `CURRENT_STATE.md` (sibling doc to `CURRENT_CYCLE.md`) explicitly states *"the operator notes further down are hand-authored and historical — treat their cycle references as the cycle they were written in, not 'now.'"* So the mixed cycle numbers (C-326, C-352, C-278) across these docs are **documented, intentional behavior**, not the inconsistency I flagged earlier — retracting that part of item 21 below.
22. **The real issue is staleness of the auto-generated header, not the hand-authored notes.** Both `CURRENT_CYCLE.md` and `CURRENT_STATE.md` carry a header block marked *"Generated from `ledger/cycle-state.json`... do not hand-edit"* with `Provenance: live-compute (unverified)`. Both show `Cycle: C-352`, GI `0.78`, pulse fetched `2026-06-24T11:13:52Z` — 18 days old, while the project has run through to C-370. If this header is genuinely regenerated automatically, the generation pipeline itself appears to have stopped, not just gone unread. `lib/gi/compute.ts` being "LOCKED per... `CURRENT_CYCLE.md`" means the lock is currently anchored to an 18-day-stale snapshot.
23. **`CURRENT_STATE.md`'s "KNOWN BROKEN — ASSIGNED" section already documents `sources.kv = 0` on the EPICON feed until first ECHO ingest post-deploy populates `epicon:feed`.** This is very likely the same condition observed live on the Globe lane today (empty EPICON feed, "ECHO ingest blocked by journal lock"). Worth confirming with ATLAS whether this is the same known-broken condition simply never having cleared post-deploy, or a new/different lock — the fix differs (redeploy-triggered ECHO ingest vs. an actual lock needing manual release).
24. **"IN PROGRESS" also lists empty journal KV keys** ("old keys expired... `sources.kv` remains 0 until fresh `journal:{AGENT}:C-278` keys are written") — same shape of problem (empty journal KV blocking downstream reads), logged as far back as C-278. If this has recurred at C-370 rather than having been a one-time expiry, it points to the journal KV lacking a refresh/TTL-renewal mechanism rather than a single incident — worth checking whether it's been recurring silently across cycles.
25. Low priority, noted for completeness: `CURRENT_STATE.md` flags **DAEDALUS self-ping returning 401 as known and explicitly not worth a standalone PR** — leave as-is unless it starts blocking something else.

## Seal Quorum Note

Recommend ATLAS, ZEUS, EVE, JADE, and AUREA each explicitly attest to item #1 (the core contradiction fix) before C-370 seals — given C-369 sealed *with* the contradiction still live, quorum should confirm this fix directly rather than inherit trust from the prior seal.

---

*"Let me update my consensus." — Mobius constitutional phrase for acknowledging new ground truth.*
