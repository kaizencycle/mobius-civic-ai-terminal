# Track R Lineage CAS-v2 Stability Report — Capture #8 / Capture #9

**Cycle:** C-404
**Status:** CUSTODIAN-VERIFIED — see `TRACK_R_V2_VERIFICATION_STATUS.md` for the full two-stage provenance chain (session-verified vs. custodian-run) and what remains outstanding.

---

## Summary

Two consecutive read-only **Track R Production Capture** runs executed
against the same production commit, `daeec8f3adb2716879ef773e5d9a63905f402050`:

| | Capture #8 (stability witness) | Capture #9 (governance candidate) |
|---|---|---|
| Capture ID | `track-r-c403-2026-08-15T2012Z` | `track-r-c403-2026-08-15T2014Z` |
| Run | [31906059559](https://github.com/kaizencycle/mobius-civic-ai-terminal/actions/runs/31906059559) | [31906143684](https://github.com/kaizencycle/mobius-civic-ai-terminal/actions/runs/31906143684) |
| Executive status | `READY_FOR_ZEUS_EVE_REVIEW` | `READY_FOR_ZEUS_EVE_REVIEW` |
| Lineage CAS v1 | `416ef085c9261a66c0838c653becbe28cfc7f1de716fbfcd3e56856398bd7f92` | `1e6810b7bb72e56468db67d4de304e425adf5d20bfe47cf8269240303d1230bb` |
| **Lineage CAS v2** | `b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb` | `b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb` |
| Execution witness v1 | `a6fa8c1d8719c9fe4e775799210d59fe3db463b3130957bb43b6d72dc6817954` | `c76f85ced49ce0444cc7632ccea5507d8fd938cbdccfc46d37635f51063591f7` (historical-only — **not** valid for v2 governance) |
| **Execution witness v2** | _not computed for this role — see note below_ | `e08999decbcdaaac06d91a9a11f06e6737756a646800db90ad8e57b865c1ccf1` |
| Witness comparison (248-record export) | `248/248 MATCH, 0 mismatch/missing/unexpected` | `248/248 MATCH, 0 mismatch/missing/unexpected` |
| Production KV identity hash | `fc84f950ed17d3863e2f7d24eac6eb3c54a7434913a47aa49c7374cce296726e` | `fc84f950ed17d3863e2f7d24eac6eb3c54a7434913a47aa49c7374cce296726e` |
| Artifact digest | `sha256:f94f0a1ac86e7d0ecde553b492680a79130250abb95302dccb8362b9dd9f732c` | `sha256:5a4e344a706a431892f650c63dc48d7cbaf953bdb20e5a16ba6f66d7d1da4b6d` |

Capture #8 is the **independent v2 stability witness** — it exists to prove
the v2 lineage hash is stable across two independent capture envelopes, not
to serve as a second governance candidate. Per the C-404 handoff, only
Capture #9 (the **canonical v2 governance candidate**) needs its own signed
v2 execution-witness hash. Capture #9's *displayed* `execution_witness_hash_v1`
(`c76f85ced4...`) is historical-only: it does not bind `lineage_snapshot_version:
'v2'` or the v2 lineage hash, and **must not** be used as, or mistaken for,
the v2 governance witness. The value that matters for v2 governance is
`execution_witness_hash_v2` (`e08999decb...`), computed via
`computeExecutionWitnessHashV2`.

**The v2 lineage hashes are identical.** The v1 hashes differ, exactly as
expected — this is the v1 metadata-binding defect (capture_id/cycle bound
into the hash) documented in PR #670 and fixed by PR #672, and it remains
observable in historical/legacy v1 output while v2 is stable across the two
new capture envelopes.

The capture ID, run link, executive status, v1/v2 lineage hashes, execution
witness v1, and artifact digest rows above were pulled directly from
GitHub's own Actions job logs via `mcp__github__get_job_logs`
(server-recorded output, independent of any handoff text) — not copied from
a handoff uncritically.

**The execution witness v2, witness comparison, and production KV identity
hash rows are different in kind: they are custodian-reported.** This
session was never given the raw artifact files. Those three rows are the
output of the custodian (kaizencycle) running the reviewed
`pnpm track-r:capture-v2-stability-verify` tool against the real extracted
artifacts and reporting the result — not a value this session pulled from
GitHub's logs or read from a file itself. See
`TRACK_R_V2_VERIFICATION_STATUS.md`'s "✅ Verified" table for the exact
source of every value, row by row.

---

## What this proves

Given identical production state at commit `daeec8f3ad...`, the v2 lineage
hash formula — which excludes `capture_id` and the operator `cycle` label —
produced the *same* hash across two independent capture envelopes taken two
minutes apart. This is the semantic-stability property CAS-v2 was built to
provide, observed against real production data for the first time (prior
evidence was limited to the historical v1 Capture #5/preflight/Capture #6
three-way comparison, which showed the *opposite* — three different v1
hashes for the same state).

## What this now additionally proves (custodian-run verification)

The custodian (kaizencycle) downloaded both raw artifact ZIPs directly and
ran the reviewed `pnpm track-r:capture-v2-stability-verify` tool
(`scripts/track-r-capture-v2-stability-verify.ts`, hardened through two
review rounds — see PR #673) against the extracted files. That run
independently re-derived, per field, from the raw capture package:

- The 248-record witness export is complete and fully matched (0 mismatch,
  0 missing, 0 unexpected) for both captures.
- The affected-block set is an exact match (no `missing_from_live` or
  `unexpected_in_live` entries) for both captures.
- The production KV identity hash resolves to the same value
  (`fc84f950ed...`) on both captures and matches historical Capture #5's.
- Capture #9's v2 execution-witness hash — `e08999decb...` — computed via
  `computeExecutionWitnessHashV2`, binding `lineage_snapshot_version: 'v2'`
  and `lineage_snapshot_hash: b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb`.

This session did not independently re-run the tool against the raw bytes
itself — the values above are the custodian's reported tool output, not a
session-side file read. See `TRACK_R_V2_VERIFICATION_STATUS.md` for the
full session-verified vs. custodian-run provenance breakdown, row by row.

## What still does not block on this report

**Verbatim raw-artifact archival** remains outstanding: `history/capture-2012Z/`
and `history/capture-2014Z/` hold provenance records assembled from GitHub's
API and job logs, not the artifact files themselves. Whoever holds the
extracted artifacts (the custodian ran the verifier against them) should
copy them in verbatim to fully close this out.

---

## Recommendation

The complete v2 hash packet for Capture #9 — lineage hash, v2
execution-witness hash, semantic manifest hash, rollback manifest hash, KV
identity hash, and 248/248 witness match — is now available and
custodian-verified. ZEUS and EVE review can proceed using the templates in
this directory. Verbatim raw-artifact archival should still be completed
before this candidate is treated as fully immutable-archived, but it does
not block the start of ZEUS/EVE review since the hash packet itself is what
governance adjudicates.

---

*"We heal as we walk." — Mobius Systems*
