# Track R Capture #9 v2 Governance Packet — Verification Status

**Cycle:** C-404
**Status:** CUSTODIAN-VERIFIED — the complete v2 hash packet has been computed and reported PASS; only verbatim raw-artifact archival remains outstanding (see below)
**Production mutation:** FORBIDDEN (unaffected by this status)
**Track R execution:** NOT AUTHORIZED (unaffected by this status)

This packet went through two stages:

1. **Session-side verification** — the session that first assembled this
   packet could not download the two Track R Production Capture artifact
   ZIPs itself (Azure blob storage, `productionresultssa4/15.blob.core.windows.net`,
   returned an HTTP 403 policy denial through this session's network egress
   policy — not a transient failure). It confirmed everything possible from
   GitHub's own API and Actions job logs instead, and left the rest
   explicitly BLOCKED rather than fabricate it. `scripts/track-r-capture-v2-stability-verify.ts`
   was written for, but not run against, real data at that stage.
2. **Custodian-side verification (this update)** — kaizencycle downloaded
   both artifacts directly, and after two rounds of review found and the
   session fixed five real bugs in the verifier script (wrong KV-identity-hash
   field path, hardcoded-null lineage pointers, a witness-completeness check
   that didn't actually check completeness, and a cross-capture check that
   didn't require the two capture IDs to differ — see PR #673's review
   history), ran the corrected `pnpm track-r:capture-v2-stability-verify`
   against the real extracted artifacts, and reported a full **PASS** with
   the complete v2 hash packet below. This session did not independently
   re-run the tool against the raw bytes — the values below are the
   custodian's reported tool output, not this session's own file read.
   That provenance distinction is preserved throughout this document.

---

## ✅ Verified

| Check | Result | Source |
|---|---|---|
| Both runs completed successfully | ✅ run 31906059559 and 31906143684, both `conclusion: success` | GitHub Actions job logs (session-verified) |
| Both ran against commit `daeec8f3adb2716879ef773e5d9a63905f402050` | ✅ | GitHub Actions job logs (session-verified) |
| Distinct capture IDs (`...2012Z` / `...2014Z`) | ✅ PASS | `track-r-capture-v2-stability-verify` (custodian-run) |
| Artifact #8 digest | ✅ `sha256:f94f0a1ac86e7d0ecde553b492680a79130250abb95302dccb8362b9dd9f732c` | GitHub `upload-artifact@v4` log line (session-verified) |
| Artifact #9 digest | ✅ `sha256:5a4e344a706a431892f650c63dc48d7cbaf953bdb20e5a16ba6f66d7d1da4b6d` | GitHub `upload-artifact@v4` log line (session-verified) |
| v1 lineage hashes differ (Capture #8 `416ef085...`, Capture #9 `1e6810b7...`) | ✅ confirmed different — this IS the v1 defect, expected | GitHub job logs (session-verified) |
| **CAS-v2 lineage stability** (Capture #8 v2 == Capture #9 v2) | ✅ PASS — `b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb` on both | `track-r-capture-v2-stability-verify` (custodian-run); also matches the session's earlier console-log confirmation |
| Affected-block exact-set comparison | ✅ PASS | `track-r-capture-v2-stability-verify` (custodian-run) |
| Witness export completeness | ✅ PASS — `export_complete: true` | `track-r-capture-v2-stability-verify` (custodian-run) |
| Witness comparison | ✅ **248/248 MATCH**, 0 mismatch, 0 missing, 0 unexpected | `track-r-capture-v2-stability-verify` (custodian-run) |
| KV identity binding present | ✅ PASS | `track-r-capture-v2-stability-verify` (custodian-run) |
| **Capture #9 v2 execution-witness hash** | ✅ `e08999decbcdaaac06d91a9a11f06e6737756a646800db90ad8e57b865c1ccf1` | `track-r-capture-v2-stability-verify` (custodian-run) — this is the value the earlier BLOCKED status could not produce. Computed only for Capture #9 (the governance candidate); the tool computes a v2 execution-witness hash per capture independently, but does **not** cross-compare Capture #8's and Capture #9's execution-witness hashes against each other anywhere in `main()` — see the caveat immediately below. |
| Production KV identity hash | ✅ `fc84f950ed17d3863e2f7d24eac6eb3c54a7434913a47aa49c7374cce296726e` | `track-r-capture-v2-stability-verify` (custodian-run) — matches historical Capture #5's KV identity hash |
| Semantic manifest hash | ✅ `27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa` | `track-r-capture-v2-stability-verify` (custodian-run) + session-verified via job logs — matches historical Capture #5 |
| Rollback manifest hash | ✅ `0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d` | `track-r-capture-v2-stability-verify` (custodian-run) + session-verified via job logs — matches historical Capture #5 |
| `execution_authorized: false` (both captures) | ✅ | GitHub job logs (session-verified) |
| Live lineage-pointer observation succeeded rather than falling back to placeholder null | ✅ | Both session-side inference (non-null v2 hash printed) and now confirmed by the custodian-run verifier reading real `observed_baseline.active_lineage_version`/`.live_canonical_pointer` values |
| `production_mutation_performed: false` | ✅ high-confidence by code inspection — hardcoded in `buildTrackREvidencePackage`; the script performs no writes | Code review, not a runtime read |

> **Caveat on execution-witness stability:** `scripts/track-r-capture-v2-stability-verify.ts`'s
> `main()` cross-compares the two captures' **lineage** hashes
> (`resultA.recomputed.lineage_snapshot_hash_v2 === resultB.recomputed.lineage_snapshot_hash_v2`)
> but never cross-compares their **execution-witness** hashes against each
> other — each capture's `v2_execution_witness_hash` is computed
> independently inside `verifyCapture()`, with no pairwise check anywhere in
> the script. This is consistent with the packet's design (only Capture #9,
> the governance candidate, needs a retained v2 execution-witness hash — see
> `execution_witness_hash_v2_note` in both `GITHUB_PROVENANCE.json` files),
> but it means **no claim of "execution-witness stability across Capture #8
> and #9" should be read into this table** — only the single value above,
> Capture #9's own hash, was produced and verified against the tool's
> internal gating (witness completeness + KV identity binding), not against
> Capture #8's.

## ⛔ Still outstanding

| Item | Status |
|---|---|
| **Verbatim raw-artifact archival** | Not done. `history/capture-2012Z/` and `history/capture-2014Z/` still contain only `GITHUB_PROVENANCE.json` provenance records, not the actual artifact file contents (`TRACK_R_LIVE_DRY_RUN_PACKAGE.json`, `TRACK_R_LIVE_WITNESS_COMPARISON_REDACTED.json`, etc.) — this session has still never received the raw files themselves, only reported tool output. Whoever holds the extracted artifacts should copy them in verbatim to fully close this out. |
| Independent session-side re-verification | The values above come from the custodian running the (now-fixed, twice-reviewed) verifier tool and reporting its output — a legitimate and now well-tested verification path, but this session has not independently read the raw bytes itself. If that matters for a given reviewer's bar, re-run `pnpm track-r:capture-v2-stability-verify` yourself against the artifacts and compare. |

---

## What this means for governance

The complete v2 hash packet for Capture #9 is now available, and ZEUS/EVE
review can proceed using the templates in this directory. The one remaining
gap (verbatim artifact archival) does not block starting that review — the
hash packet itself is what governance adjudicates — but should be closed
before this candidate is treated as fully immutable-archived.

---

*"We heal as we walk." — Mobius Systems*
