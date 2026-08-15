# Track R Lineage CAS-v2 Stability Report — Capture #8 / Capture #9

**Cycle:** C-404
**Status:** Partial verification — see `TRACK_R_V2_VERIFICATION_STATUS.md` for what is and isn't independently confirmed.

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
| Artifact digest | `sha256:f94f0a1ac86e7d0ecde553b492680a79130250abb95302dccb8362b9dd9f732c` | `sha256:5a4e344a706a431892f650c63dc48d7cbaf953bdb20e5a16ba6f66d7d1da4b6d` |

**The v2 lineage hashes are identical.** The v1 hashes differ, exactly as
expected — this is the v1 metadata-binding defect (capture_id/cycle bound
into the hash) documented in PR #670 and fixed by PR #672, and it remains
observable in historical/legacy v1 output while v2 is stable across the two
new capture envelopes.

All figures in the table above were pulled directly from GitHub's own
Actions job logs via `mcp__github__get_job_logs` (server-recorded output,
independent of the handoff that requested this packet) — not copied from the
handoff text uncritically. They match the handoff's claims exactly.

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

## What this does not yet prove

This report does **not** independently confirm, field-by-field, that every
v2-semantic input (seal index, collision-pair count, affected-block set,
witness/resolution-table hashes, lineage pointers) was individually
unchanged between the two captures — only that the *hash* of all of them
together matched. A hash match across two runs implies the inputs were
identical (hash collisions are not a practical concern here), so this is
strong evidence, but the underlying per-field values were not separately
re-derived from the raw capture package in this session, because that
package could not be downloaded (network policy blocker — see
`TRACK_R_V2_VERIFICATION_STATUS.md`).

It also does **not** include a v2 execution-witness hash for either capture.
The capture script does not yet compute one; recomputing it requires
per-record witness data only present in the raw package JSON.

---

## Recommendation

Treat this report as **stability evidence**, not a **complete governance
attestation**. ZEUS and EVE should not adopt until:

1. The raw package JSON for both captures has been obtained and run through
   `scripts/track-r-capture-v2-stability-verify.ts` (added in this PR).
2. A v2 execution-witness hash has been computed for Capture #9 and shown to
   bind `lineage_snapshot_version: 'v2'` and
   `lineage_snapshot_hash: b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb`.

---

*"We heal as we walk." — Mobius Systems*
