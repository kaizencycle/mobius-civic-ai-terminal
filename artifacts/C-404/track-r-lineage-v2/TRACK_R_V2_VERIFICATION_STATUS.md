# Track R Capture #9 v2 Governance Packet — Verification Status

**Cycle:** C-404
**Status:** PARTIAL — independently verified where possible; some Phase 1/3 steps BLOCKED by sandbox network policy, not fabricated
**Production mutation:** FORBIDDEN (unaffected by this status)
**Track R execution:** NOT AUTHORIZED (unaffected by this status)

This document exists because the session that assembled this packet could not
download the two Track R Production Capture artifact ZIPs — Azure blob
storage (`productionresultssa4.blob.core.windows.net`,
`productionresultssa15.blob.core.windows.net`) is not reachable through this
session's network egress policy (HTTP 403 policy denial on CONNECT, not a
transient failure). Per this environment's own operating guidance: *"Do not
retry or route around it — report the blocked host."*

Rather than fabricate the parts that require the artifact contents, this
packet is honest about exactly what is and isn't independently confirmed.

---

## ✅ Independently verified (from GitHub's own API and Actions job logs — not just the handoff text)

These were pulled directly from GitHub via `mcp__github__get_job_logs` and
`mcp__github__actions_list`, which are authoritative, server-recorded sources
independent of the ATLAS × Cursor handoff that requested this packet:

| Check | Result |
|---|---|
| Both runs completed successfully | ✅ run 31906059559 and 31906143684, both `conclusion: success` |
| Both ran against commit `daeec8f3adb2716879ef773e5d9a63905f402050` | ✅ confirmed in both job logs' `git log -1 --format=%H` output |
| Capture #8 v2 lineage hash | ✅ `b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb` (console output) |
| Capture #9 v2 lineage hash | ✅ `b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb` (console output) |
| **Capture #8 v2 == Capture #9 v2** | ✅ **identical**, matching the handoff's claim exactly |
| Capture #8 v1 lineage hash | ✅ `416ef085c9261a66c0838c653becbe28cfc7f1de716fbfcd3e56856398bd7f92` |
| Capture #9 v1 lineage hash | ✅ `1e6810b7bb72e56468db67d4de304e425adf5d20bfe47cf8269240303d1230bb` |
| v1 hashes differ (expected, documents the v1 defect persists historically) | ✅ confirmed different |
| Artifact #8 digest | ✅ `sha256:f94f0a1ac86e7d0ecde553b492680a79130250abb95302dccb8362b9dd9f732c` — matches GitHub's own `upload-artifact@v4` log line exactly |
| Artifact #9 digest | ✅ `sha256:5a4e344a706a431892f650c63dc48d7cbaf953bdb20e5a16ba6f66d7d1da4b6d` — matches GitHub's own `upload-artifact@v4` log line exactly |
| Both: `execution_authorized: false` | ✅ printed by the capture script in both job logs |
| Both: `affected_block_set_match: true` | ✅ printed by the capture script in both job logs |
| Both: `Live witness ok: true` | ✅ printed by the capture script in both job logs |
| Both: `executive_status: READY_FOR_ZEUS_EVE_REVIEW` | ✅ printed by the capture script in both job logs |
| Both: semantic manifest hash identical to each other and to historical Capture #5 (`27c94b0f5b4e...`) | ✅ printed by the capture script in both job logs |
| Both: rollback manifest hash identical to each other and to historical Capture #5 (`0a61a3ff9cd9...`) | ✅ printed by the capture script in both job logs |
| Live lineage-pointer observation succeeded (item 12) rather than falling back to a placeholder null | ✅ **inferred with high confidence**: `buildTrackREvidencePackage` (merged in PR #672) sets `lineage_snapshot_hash_v2` to `null` specifically when the live-pointer read fails or credentials are unavailable. Both runs printed a real 64-hex-char v2 hash, not `null` — so the pointer read must have succeeded in both. |

## ⛔ BLOCKED — requires the raw artifact ZIP, not available in this session

| Check | Why it's blocked |
|---|---|
| Artifact ZIP byte-for-byte digest verification against local download | Cannot download the ZIP — network policy denial. GitHub's own recorded digest (above) is the closest available substitute; it is authoritative but was not independently recomputed here from bytes. |
| Recompute stored v1 lineage hash from raw `observed_baseline` fields | Requires `TRACK_R_LIVE_DRY_RUN_PACKAGE.json` inside the ZIP. |
| Recompute stored v2 lineage hash from raw `observed_baseline` fields | Same — requires the ZIP. (The printed console value above is trusted as the script's own direct output, but was not re-derived from first principles here.) |
| **v2 execution-witness hash** (Phase 3) | The capture script does not currently print a v2 execution-witness hash — only a v1 one, which the handoff explicitly warns is not valid for v2 governance. Recomputing `computeExecutionWitnessHashV2` requires `per_record_results`, live/pinned affected-block numbers, `export_source`, and `environment_identifier`, all only available inside the ZIP. **Not fabricated.** |
| Exact witness match/mismatch/missing/unexpected counts | Only in the raw package JSON. |
| KV identity status/hash string | Printed only to the GitHub Step Summary (rendered client-side, not retrievable via this session's log/API access), not to the job log. |
| `production_mutation_performed: false` as a directly-observed value | Not printed to the job log. High-confidence by code inspection (the field is hardcoded `false` in `buildTrackREvidencePackage`/`buildTrackREvidencePackage` result type and the script never performs writes), but not independently read from this run's output. |
| Exact affected-block-set hash, 123-position count, 125-collision-pair count, seal-index state, projected next sequence, active-lineage version, live canonical pointer | All inside the raw package JSON only. |
| Verbatim artifact archival (Phase 2) | Cannot copy files this session never had. `history/capture-2012Z/` and `history/capture-2014Z/` contain `GITHUB_PROVENANCE.json` — a provenance record built from GitHub API/log data — instead of the verbatim artifact. |

---

## What this means for governance

**This packet is not yet ready for ZEUS/EVE adoption.** The two most
consequential unknowns are:

1. The v2 execution-witness hash has not been computed for either capture —
   ZEUS/EVE cannot verify "Capture #9's complete v2 hash packet" without it.
2. The full witness completeness and exact-123-position affected-set claims
   are corroborated only by the capture script's own summary line
   (`affected_block_set_match: true`), not independently re-derived from the
   per-record data.

**To complete this packet:**

1. Someone (or a session) with artifact-download access should fetch
   `track-r-production-capture.zip` for run 31906059559 and run 31906143684.
2. Run `scripts/track-r-capture-v2-stability-verify.ts` (added in this PR)
   against both extracted `TRACK_R_LIVE_DRY_RUN_PACKAGE.json` files. It
   recomputes v1 and v2 lineage hashes from the stored `observed_baseline`
   and asserts `capture8.v2 == capture9.v2 == b5f781f6...ef9fb`, and computes
   the v2 execution-witness hash via `computeExecutionWitnessHashV2`.
3. Replace the two `GITHUB_PROVENANCE.json` files with the verbatim artifact
   contents (keep the provenance files too, as a record of what this session
   was able to confirm independently).
4. Only then should ZEUS and EVE begin their independent review using the
   templates in this directory.

---

*"We heal as we walk." — Mobius Systems*
