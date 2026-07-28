# C-386 — ZEUS adversarial handoff (sub-cycle: news feed provenance)

**Cycle:** C-386  
**Status:** HANDOFF / ADVERSARIAL REVIEW  
**Target agent:** ZEUS  
**Supporting reviewers:** EVE (consequence/agency), ATLAS (implementation witness)  
**Human authority:** Michael Judan  
**Scope:** `lib/eve/global-news.ts`, `lib/echo/sources.ts`, `lib/terminal/instrumentCoords.ts`, `lib/eve/governance-synthesis.ts`, `app/api/eve/global-news/route.ts`  
**Risk class:** MEDIUM (news feed drives `global_tension` and downstream EPICON escalation via ECHO ingestion; does not itself gate consequential action)

---

## Executive intent

This is not a new C-386 principle. It is the existing C-386 doctrine — quorum is evidentiary independence, not agent headcount — applied to a live subsystem that was already violating it before the doctrine was written down.

The news feed (`fetchEveGlobalNews`) is the input surface that ECHO's integrity engine scores into MII/GI/MIC. Until this patch:

- it ran on exactly one live source (Wikipedia Current Events, regex-scraped),
- a second source (`fetchGDELTGlobal`) existed in code but was never wired in,
- item corroboration was determined by fuzzy title-matching, not evidentiary root identity,
- two of EVE's own categories (`ethics`, `civic-risk`) were silently collapsed into `governance` before reaching the shard-weight logic that was written to score them distinctly.

ZEUS's job is to assume the patch is wrong until demonstrated otherwise — same posture as the KV_MEMORY_CONTRACT review.

---

## What changed (for adversarial context)

- `EveNewsItem` gained `source_type` and `root_id`.
- `fetchGDELTGlobal()` is now called in `Promise.allSettled` alongside Wikipedia.
- `countIndependentNewsRoots()` counts distinct `source_type:root_id` pairs and is surfaced as `independent_source_count` on `EveSynthesis`.
- `eveItemsToRawEvents()` no longer collapses `ethics` / `civic-risk` into `governance`.
- `RawEvent.category` widened to match `EpiconItem.category`.
- Internal substrate preview items use `source_type: eve_internal_substrate` with cycle-scoped `root_id`.
- Five missing instrument coordinate pins restored on the globe.

---

## ZEUS assignment — attack surfaces

### Z-N1 — Root alias attack (news variant of Z-002)

GDELT frequently returns syndicated wire copy — the same AP/Reuters story mirrored across multiple domains. Test whether `root_id = gdelt:{domain}:{normalizeDedupKey(title)}` treats each mirror as an independent root. **Expected:** it currently WILL, because `root_id` keys on domain. Construct a case with 3 mirrored headlines and confirm `independent_source_count` inflates to 3 when the evidentiary reality is 1 wire report.

### Z-N2 — Wikipedia/GDELT same-event double-count

A single real-world event will likely appear in both Wikipedia Current Events and GDELT within the same day. Confirm whether differing `source_type` causes this to count as 2 independent roots or whether it should count as 1. Flag which interpretation the current code implements and whether that matches C-386 evidentiary-independence intent.

### Z-N3 — GDELT reliability regression test

ECHO `sources.ts` comment (C-296) states GDELT was "dead… 3+ days returning 0." Confirm whether that condition still holds at review time. If GDELT is still unreliable, re-enabling it does not add a second source — it adds a second usually-empty source. **Expected output:** explicit PASS/FAIL on current GDELT liveness, not an assumption inherited from a stale comment.

### Z-N4 — Ethics/civic-risk shard routing verification

Construct an EVE item with `category: 'ethics'`, run through `eveItemsToRawEvents` → `rateEvent`, and confirm `shardType === 'stewardship'`. Same for `civic-risk` → `guardian`.

### Z-N5 — Independent-source gaming

(a) Same GDELT article twice with slightly different title casing/whitespace — tests `normalizeDedupKey` robustness.  
(b) Wikipedia item and GDELT item from the same press release — doctrinal verdict required.

### Z-N6 — Silent type widening side effects

`RawEvent.category` now accepts `narrative | ethics | civic-risk`. Confirm no downstream consumer has an exhaustive switch that misroutes these values.

### Z-N7 — Instrument coordinate patch, sanity only

Confirm five added `INSTRUMENT_COORDS` entries do not collide with existing keys and `familyFromAgent()` still parses all five.

---

## Non-goals

This patch SHALL NOT:

- change `computeGlobalTension()` thresholds (follow-on, not bundled),
- introduce a new source beyond GDELT re-enablement,
- alter MII/GI/MIC formulas or shard weights,
- retroactively reclassify historical EPICON items collapsed under old ethics/civic-risk → governance behavior.

---

## ZEUS output format

```
ZEUS C-386 (NEWS FEED SUB-CYCLE) ADVERSARIAL REPORT
1. CLAIM UNDER REVIEW
2. ATTACK SURFACES TESTED (Z-N1 through Z-N7)
3. ROOT ALIAS / SYNDICATION TEST RESULT
4. GDELT LIVENESS VERDICT (current, not inherited from C-296)
5. ETHICS/CIVIC-RISK SHARD ROUTING TEST RESULT
6. INDEPENDENT-SOURCE GAMING TEST RESULT
7. TYPE-WIDENING SIDE-EFFECT SCAN
8. COUNTERFACTUAL
9. REMAINING FAILURE MODES
10. VERDICT: PASS / CLARIFY / QUARANTINE
```

ZEUS should distinguish "I found no failure" from "I proved no failure exists" per standing C-386 doctrine — Z-N2 in particular is more likely **CLARIFY** than PASS or QUARANTINE.

---

## Human merge gate

ATLAS implementation witness → ZEUS adversarial verdict → EVE consequence check if flagged → Michael Judan final merge/hold decision. This sub-cycle does not seal itself.

---

**C-386 NEWS FEED HANDOFF COMPLETE**  
ZEUS → Trust no root count that cannot show its aliasing logic.
