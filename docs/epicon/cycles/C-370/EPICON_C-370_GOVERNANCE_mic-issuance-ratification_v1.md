---
epicon_id: EPICON_C-370_GOVERNANCE_mic-issuance-ratification_v1
title: "MIC Issuance Doctrine Ratification & earnMIC Fountain Gate — C-370"
author_name: "ATLAS Agent (+Michael)"
author_wallet: ""
cycle: "C-370"
epoch: ""
tier: "SUBSTRATE"
scope:
  domain: "governance"
  system: "civic-ai-terminal"
  environment: "mainnet"
epicon_type: "doctrine-ratification"
status: "active"
related_prs: []
related_commits: []
related_epicons:
  - "EPICON_C-238_INFRA_trust-layer-formalization_v1"
tags:
  - "mic"
  - "witness-principle"
  - "goodhart-resistance"
  - "canon-runtime-contradiction"
  - "fountain"
  - "c-369"
integrity_index_baseline: 0.773
risk_level: "medium"
created_at: "2026-07-12T00:00:00Z"
updated_at: "2026-07-12T00:00:00Z"
version: 1
hash_hint: ""
summary: "Resolves the C-369 canon/runtime contradiction (§17 Witness Principle canonized same cycle earnMIC minted unconditionally) by ratifying the existing mic_issuance_protocol.md doctrine and wiring a Fountain GI-threshold gate in front of earnMIC. Also corrects a misdiagnosis in the C-370 handoff: the 'journal lock' blocking EPICON ingest was a hardcoded UI placeholder string, not a live condition."
---

# EPICON C-370: MIC Issuance Doctrine Ratification & earnMIC Fountain Gate

- **Layer:** GOVERNANCE > civic-ai-terminal > canon/runtime contradiction resolution
- **Author:** ATLAS Agent (+Michael)
- **Date:** 2026-07-12
- **Status:** Active
- **Prior seal state:** C-369 — DISPUTED (canon/runtime contradiction). Not reopened; C-370 carries the resolution, per the handoff's own recommendation that reopening a sealed cycle is itself a Witness Principle concern.

## Context

C-369 canonized §17 (Goodhart Resistance Doctrine / Constitutional Principle IV) on the same cycle that `earnMIC` in `contexts/WalletContext.tsx` / `hooks/useTerminalData.ts` remained live, minting MIC directly from a client-side integrity score with no GI, sustain, Vault, or Fountain gate. A canonized doctrine and an actively executing contradiction of that doctrine cannot coexist under seal.

The fix already existed in writing: `docs/protocols/mic/mic_issuance_protocol.md`, sitting since C-285 in `Status: Proposed... draft` — never ratified. It draws exactly the distinction needed: reward accounting (provisional scores) is a continuous layer, separate from mint authorization, which requires the Fountain integrity gate (GI ≥ 0.95, sustained). C-370's job was to ratify this doc and wire the runtime to enforce it, not invent a new fix.

## Findings

### 1. Confirmed: `earnMIC` contradicted the doctrine

`hooks/useTerminalData.ts` called `earnMIC('echo_integrity_mint', micProv, ...)` whenever ECHO's `totalMicProvisional` was positive, with no integrity gate. `lib/echo/integrity-engine.ts` already documents `totalMicProvisional` as *"Sum of provisional MIC from integrity ratings... not circulation mint"* — the type-level distinction existed, but the wallet layer collapsed it into spendable balance anyway.

**Fix:** Added a `FOUNTAIN_MINT_GI_THRESHOLD = 0.95` gate immediately before the `earnMIC` call, keyed off the same `gi.score` (`GISnapshot`) already loaded in this hook. When GI is below threshold, the effect returns without marking the cycle consumed, so it retries on the next poll if GI recovers — reserve/provisional accounting is untouched, only the mint-to-spendable step is gated. This matches the doctrine's Fountain unlock rule (GI ≥ 0.95 sustained) rather than inventing a new threshold.

### 2. Correction to the handoff: no live "journal lock" exists

The handoff's live-telemetry section treated `"ZEUS: EPICON feed empty, ECHO ingest blocked by journal lock"` as a direct ZEUS diagnostic and recommended clearing the lock as C-370's first action. Investigation found this is a **hardcoded placeholder string** in `components/terminal/chambers/GlobeChapterDashboards.tsx` (line ~250), rendered any time the seismic array is empty, regardless of cause. No lock, mutex, or gating mechanism named `journal_lock` (or equivalent) exists anywhere in the ingest pipeline (`app/api/echo/ingest/route.ts`, `app/api/cron/echo-ingest/route.ts`, `lib/echo/*`).

A second instance of the same pattern was found in `components/terminal/chambers/SentinelChamber.tsx`: a "ZEUS DISPUTE ROOT CAUSES" panel that renders three static, hardcoded findings from C-324 (including "Journal lane blocked — ledger returning 503") any time a *live* dispute is active, presenting stale copy as current diagnosis.

**Fix:** Rewrote the Globe panel's empty-state text to stop asserting an unverified cause, and relabeled the Sentinel panel "KNOWN FAILURE MODES (C-324 reference, not live-diagnosed)" so it can no longer be read as a live ZEUS finding. This is itself a Witness Principle fix — presenting fabricated diagnostic text as live telemetry is exactly the "invents health" / "invents findings" failure `CURRENT_CYCLE.md`'s own product doctrine warns against.

### 3. What the real live signal shows instead

The most recent live ZEUS verification pass (`docs/catalog/zeus/2026-07-12T12-02-42Z-verification.json`, `verification_status: "disputed"`) shows genuine, active issues — unrelated to any "journal lock":

- GI layer divergence: ATLAS catalog 0.786 vs `/api/integrity-status` 0.773 vs micro composite 0.903 (persistent).
- `kv_keys_ok=false` persistent despite `kv_keys.ok=true` / seed 200 OK.
- `POST /api/agents/journal` succeeded (200, `canonical=true`) but `mirrored_to_kv=false`, `kv_error=kv_write_failed` — flagged as **transient**, not a block.
- `POST /api/vault/attest` returns HTTP 404 (route not deployed) — quorum registration cannot complete.
- micro cycle (`C-306`) lags the operator cycle (`C-370`).

These are the actual open issues for the next verification pass, not a journal lock.

## Changes in this cycle

- `docs/protocols/mic/mic_issuance_protocol.md` — status line moved from `Proposed... C-285 draft` to ratified, referencing this entry.
- `hooks/useTerminalData.ts` — added `FOUNTAIN_MINT_GI_THRESHOLD` gate in front of the `earnMIC` call.
- `components/terminal/chambers/GlobeChapterDashboards.tsx` — removed the fabricated "journal lock" diagnostic string from the seismic empty state.
- `components/terminal/chambers/SentinelChamber.tsx` — relabeled the static C-324 failure-mode panel so it is no longer presented as live ZEUS diagnosis.

## Deferred (not implemented this cycle)

The C-370 handoff listed ~20 optimizations beyond the mint-doctrine fix. Per explicit scoping with the human custodian, the following remain open and are **not** resolved by this entry — listed here so they aren't silently dropped:

- CI structural check for score→MIC arithmetic patterns (extend EPICON Guard).
- Reserve Block `.dat` regeneration for the 349 hot-KV-attested blocks (`canon/reserve-blocks/` does not exist in this checkout).
- DWE vs. DVA GI formula ratification (governance/seal-quorum decision, not a unilateral code change).
- Fountain unlock gate wiring beyond the earnMIC mint path (item scoped to the wallet mint step only; other consumers of the GI≥0.95 sustain gate, if any, are unaudited).
- CI git exit-128 re-verification, GII threshold alignment confirmation, HIVE write-back loop, MII sentinel re-audit, Upstash cron cadence re-check, cross-repo EPICON Guard re-audit.
- Seal-quorum attestation from ATLAS/ZEUS/EVE/JADE/AUREA on this fix.

## Integrity Notes

- **MII impact:** Positive — closes a confirmed doctrine/runtime contradiction and removes two instances of fabricated live-diagnostic text.
- **GI impact:** Neutral — this entry does not change measured GI; it changes what MIC does in response to GI.
- **Risk:** Medium — `earnMIC` now stops accruing spendable balance below GI 0.95, which is a live behavior change while GI sits at 0.77–0.9. This is the intended enforcement, not a regression, but operators should expect visibly reduced MIC accrual until GI recovers or the Fountain sustain window is met.
