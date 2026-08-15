# ATLAS × Human Custodian — Track R Execution Handoff (Capture #5)

**Cycle:** C-403  
**Capture ID:** `track-r-c403-2026-08-15T0123Z`  
**Attestation PR:** #663 merged  
**Governance PR:** #664 merged  
**Track R execution:** **NOT AUTHORIZED** (until all gates below pass)

---

## Purpose

This handoff defines the **separate one-shot execution path** after:

1. Capture #5 pin-validated evidence (immutable archive)
2. ZEUS ADOPT + EVE ADOPT (#664)
3. Human custodian consent (#666)
4. PR #661 custodian disposition (governance debt)
5. Non-executable one-shot handoff shell prepared (`HANDOFF_C-403_TRACK_R_EXECUTION_ONE_SHOT_DRAFT.md`)
6. Fresh pre-mutation CAS match **immediately before** explicit execution authorization (time-sensitive)

This document does **not** authorize mutation. It specifies the ordered gates and verification commands.

**CAS timing rule:** Do not run the live CAS probe until #661 disposition and handoff shell prep are complete. A passing CAS is not a durable permission token — `commitGuard` must independently recheck production at apply time.

---

## Governance binding packet (do not rebind)

| Evidence | Hash |
|---|---|
| Semantic manifest | `27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa` |
| Lineage snapshot (CAS) | `3db4832725df8d3d49942e60dc9ddd00d436fdb741329362b6eb4d6753669af5` |
| Execution witness | `f35ef3c048cbf2f8ea93d4b29cd10c193627aaa1ce17b6cf3b50374348052867` |
| Rollback manifest | `0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d` |
| KV identity receipt | `fc84f950ed17d3863e2f7d24eac6eb3c54a7434913a47aa49c7374cce296726e` |
| Witness pin | `3876419a2ff46df126b0b956bca96ddfc21b45d5c9f1ab3d8e21bfaa4c5f9b5e` |

Immutable archive: `artifacts/C-403/track-r-live-dry-run/history/capture-0123Z/`

---

## Ordered execution gates

| # | Gate | Command / artifact | Status |
|---|---|---|---|
| 1 | Immutable attestation verify | `pnpm track-r:capture-attestation-verify` | ✅ tooling on `main` |
| 2 | ZEUS ADOPT | `docs/catalog/zeus/2026-08-15T13-28-00Z-track-r-capture-0123Z-verification.json` | ✅ #664 |
| 3 | EVE ADOPT | `docs/catalog/eve/2026-08-15T13-28-00Z-track-r-capture-0123Z-verification.json` | ✅ #664 |
| 4 | Human custodian consent | `HUMAN_CUSTODIAN_CONSENT_SIGNED.md` | ✅ `2026-08-15T14:07:00Z` |
| 5 | PR #661 disposition | `PR661_REVIEW_DISPOSITION.md` | ✅ B Ratify with notes — `2026-08-15T14:34:00.000Z` |
| 6 | One-shot handoff record (non-executable) | `HANDOFF_C-403_TRACK_R_EXECUTION_ONE_SHOT_DRAFT.md` | ✅ #667 |
| 7 | Fresh pre-mutation CAS (final preflight) | `pnpm track-r:execution-readiness` → see CLI output below | ⬜ run only when mutation window imminent |
| 8 | Apply-path CAS recheck wired in code | Future execution-handoff PR | ⬜ **not implemented** |
| 9 | Explicit execution authorization + apply | Separate operator command + production-derived CAS + `TRACK_R_BATCH_EXECUTION_ENABLED=true` | ⛔ forbidden |

---

## Verification commands

```bash
# Offline attestation packet (immutable archive)
pnpm track-r:capture-attestation-verify

# Pre-mutation execution readiness (requires production KV credentials)
pnpm track-r:execution-readiness

# Governance-only check without live CAS probe
pnpm track-r:execution-readiness --skip-cas-probe
```

### Expected results

| Command | When | Expected |
|---|---|---|
| `track-r:capture-attestation-verify` | Anytime (offline) | `verification_status: adopt_ready` |
| `track-r:execution-readiness --skip-cas-probe` | Governance-only | `consent_recorded_cas_required` (exit 1) |
| `track-r:execution-readiness` (production KV) | **Final preflight only** | See pass shape below |

**Operator readiness probe — expected CLI output** (not a durable permission token):

```text
Readiness status: awaiting_execution_handoff
Execution authorized: false
Attested lineage CAS: 3db4832725df8d3d49942e60dc9ddd00d436fdb741329362b6eb4d6753669af5
Fresh lineage CAS: 3db4832725df8d3d49942e60dc9ddd00d436fdb741329362b6eb4d6753669af5
Fresh CAS match: true
```

Exit code **0**. Governance invariants (not CLI fields): no apply invoked; `execution_authorized` remains `false` in governance JSON.

**Dual CAS (design requirement):** Operator probe (✅ implemented) → explicit authorization → apply path must re-read production and recompute CAS (⬜ **not implemented** — `commitGuard` accepts caller boolean only today). If either check differs → abort with zero writes; **Capture #6**.

See `HANDOFF_C-403_TRACK_R_EXECUTION_ONE_SHOT_DRAFT.md` § Implementation status.

If `readiness_status: cas_drift` → production lineage changed since capture #5. Run **Capture #6** before proceeding.

---

## Commit guard requirements (future apply — partially implemented)

From `lib/watchdog/batchRepair/commitGuard.ts` (guard checks only; **apply caller not wired**):

- `manifest_hash` verified
- `zeus_verdict`, `eve_verdict`, `human_approval` all `approved`
- `fresh_lineage_snapshot_hash_matches: true` — boolean field only today; **must be set from production re-read at apply time** (not yet implemented)
- Live seal witness export complete (248/248 universe)
- `TRACK_R_BATCH_EXECUTION_ENABLED=true` + explicit operator command
- Integrity gate active; rollback plan verified

**131→132 remains `pending_track_r_step_8` — not fabricated.**

---

## Explicit prohibitions (until execution handoff)

- No production KV mutation
- No integrity gate clearing
- No seal candidate formation
- No Fountain / sequence 361 promotion
- No silent env-var execution enablement

---

## Governance debt (#661 — closed)

- PR #661 (EP-3 pin establishment): **B Ratify with notes** — `PR661_REVIEW_DISPOSITION.md`, signed `2026-08-15T14:34:00.000Z`. Retroactive procedural cure only; not precedent for bypassing EP-3 custodian review before merge.

---

## Next operator actions (corrected order)

1. ~~Human custodian signs consent bound to capture #5 hash packet~~ ✅ `2026-08-15T14:07:00Z`
2. ~~**Custodian disposition of #661**~~ ✅ B Ratify with notes — `2026-08-15T14:34:00.000Z`
3. ~~**Non-executable one-shot handoff record**~~ ✅ `HANDOFF_C-403_TRACK_R_EXECUTION_ONE_SHOT_DRAFT.md` (#667)
4. **Run `pnpm track-r:execution-readiness`** with production KV credentials only when mutation window is imminent (final preflight)
5. **Implement apply-path CAS recheck** in a future execution-handoff PR (production re-read → recompute hash → `commitGuard`; not wired today)
6. If both CAS checks pass at apply time, **finalize explicit execution authorization** — one constrained mutation attempt, or abort with zero writes and Capture #6

*"We heal as we walk." — Mobius Systems*
