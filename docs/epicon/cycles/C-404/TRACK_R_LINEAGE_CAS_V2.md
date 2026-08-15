# Track R Lineage CAS v2 — Repair

**Cycle:** C-404
**Status:** Implemented and locally validated. Production execution remains **NOT AUTHORIZED**.
**Predecessor:** PR #670 (investigation) — `artifacts/C-403/track-r-live-dry-run/CAS_STABILITY_INVESTIGATION_2026-08-15.md`

---

## The defect

`LineageSnapshotInput` (v1, `lib/watchdog/batchRepair/snapshotIdentity.ts`) bound
`capture_id` and the operator `cycle` label into the CAS-gating lineage hash.
Both fields describe *which capture read the data and when*, not production
lineage state. The hash function itself is deterministic and correct — the
input contract was semantically wrong.

Effect: three reads of an **identical** production state produced three
different v1 lineage hashes, purely because the capture ID or cycle label
differed:

| Capture | capture_id | cycle | v1 lineage hash |
|---|---|---|---|
| Capture #5 | `...0123Z` | `C-403` | `3db4832725df8d3d4994...` |
| 16:56 preflight | `...0123Z` | `C-404` | `d0880d2936f4ffffc1d7...` |
| Capture #6 | `...1706Z` | `C-404` | `88b60b24aa3dadfb23b1...` |

Same seal bodies, same semantic manifest, same rollback manifest, same
affected-block set across all three. See PR #670 for the full field-level
three-way comparison that established this.

---

## The fix: an explicitly versioned domain

v1 is **not modified**. It remains fully intact — the hash function, its
input type, and every consumer that verifies historical Capture #5 / #6
evidence (`verifyTrackRCaptureAttestation`, `verifyTrackRExecutionReadiness`,
`runBatchApplyPreflight`, `CAPTURE_0123Z_EXPECTED_HASHES`) is untouched by
this PR.

A new, additive v2 domain is introduced alongside it:

```
lib/watchdog/batchRepair/
├── snapshotIdentity.ts
│   ├── LineageSnapshotInput            (v1 — unchanged)
│   ├── computeLineageSnapshotHash      (v1 — unchanged)
│   ├── LINEAGE_SNAPSHOT_DOMAIN_V2      (new: "mobius.track-r.lineage-snapshot.v2")
│   ├── LineageSnapshotV2Input          (new — no capture_id, no cycle)
│   └── computeLineageSnapshotHashV2    (new)
├── executionWitnessHash.ts
│   ├── computeExecutionWitnessHash     (v1 — unchanged)
│   ├── ExecutionWitnessHashInputV2     (new — adds lineage_snapshot_version: 'v2')
│   └── computeExecutionWitnessHashV2   (new)
└── lineageSnapshotVersionGuard.ts      (new — version/hash-binding rejection rules)
```

`LINEAGE_SNAPSHOT_DOMAIN_V2` is itself hashed as part of the v2 payload
(`schema_domain: LINEAGE_SNAPSHOT_DOMAIN_V2, ...input`), so a v1 digest can
never be reinterpreted as a v2 digest, or vice versa, regardless of what the
remaining fields happen to contain.

### Removed from the hashed payload

- `capture_id` — identifies the evidence envelope, not production state.
- `cycle` — the operator's cycle label at capture time, not production state.

Both still belong in the surrounding evidence/telemetry layer (capture
package metadata, execution-witness `export_source` /
`environment_identifier`) — they are simply no longer inside the CAS-gating
hash itself.

### Retained — every field is production lineage, not envelope/telemetry

| Field | Why it's production lineage |
|---|---|
| `latest_attested_seal` / `attested_seal_index` | Identity and length of the production seal chain — the core CAS anchor. |
| `projected_next_sequence` | The next block position, a property of chain state. |
| `historical_collision_pairs` | Count of historically hash-divergent seal pairs in the ledger. |
| `contested_block_positions` / `uncontested_positions` | Partition of reserve block positions into contested vs. clean. |
| `canonical_reserve_blocks` | The canonical reserve block set itself. |
| `integrity_gate_active` | Whether the production integrity gate is engaged — a live execution precondition. |
| `reserve_block_lane` | Which reserve lane production is currently on. |
| `candidate_formation_blocked` | Whether candidate formation is blocked in production. |
| `witness_audit_hash` / `resolution_table_hash` | Hashes of the pinned witness universe and resolution table this capture is checked against. |
| `active_lineage_version` / `live_canonical_pointer` | The production lineage pointer state itself. |
| `pinned_affected_block_numbers_hash` / `live_affected_block_numbers_hash` / `affected_block_set_match` | The pinned-vs-live affected-block-set comparison outcome — core CAS material. |

(Same table lives as a doc comment directly above `LineageSnapshotV2Input` in
`snapshotIdentity.ts`.)

---

## Execution-witness binding

`computeExecutionWitnessHashV2` binds an explicit
`lineage_snapshot_version: 'v2'` field plus the v2 lineage hash into the
witness hash, alongside the existing witness/manifest evidence fields
(unchanged from v1). A witness can never be silently paired with a lineage
hash from the wrong domain.

## Version safety guard

`lineageSnapshotVersionGuard.ts` — `assertLineageSnapshotVersionAccepted` —
is the single place that enumerates supported versions
(`SUPPORTED_LINEAGE_SNAPSHOT_VERSIONS = ['v2']`) and rejects:

1. a missing lineage snapshot version,
2. a v1 packet presented where v2 is required (`'v1'` is simply not in the
   supported set),
3. a mixed v1/v2 evidence packet (lineage side and witness side declare
   different versions),
4. an execution witness bound to a lineage snapshot hash other than the
   fresh one just computed, and
5. an unknown future version (e.g. `'v3'`) — a new version only becomes
   acceptable via an explicit, reviewed change to
   `SUPPORTED_LINEAGE_SNAPSHOT_VERSIONS`, never implicitly.

All five are covered by contract tests in
`tests/contract/trackRLineageSnapshotV2.test.ts`, alongside the required
semantic-stability and material-sensitivity matrices and a regression test
that reproduces the pinned v1 three-way drift and shows it collapses to one
v2 hash.

---

## What this PR does **not** do

Per the CAS-v2 handoff, switching the live execution paths
(`verifyTrackRExecutionReadiness`, `runBatchApplyPreflight`, `commitGuard`)
over to require v2 is **explicitly out of scope here** — there is no
attested v2 capture yet to compare against, and forcing those paths onto v2
before one exists would just hard-block on a missing baseline rather than
provide a real gate. Those paths continue to verify Capture #5 under v1,
completely unaffected by this PR.

What *is* wired in now, additively and non-breaking:

- `computeFreshLineageSnapshotFromProduction` (used by the readiness and
  apply-preflight probes) now also computes `fresh_lineage_snapshot_hash_v2`
  on every probe. It is reported but does not gate `fresh_cas_match` or any
  pass/fail decision.
- `buildTrackREvidencePackage` (used by `pnpm track-r:production-capture`,
  i.e. the "Track R Production Capture" GitHub Actions workflow) now also
  computes and records `lineage_snapshot_hash_v2` in its output package
  (`attestation_hashes.lineage_snapshot_hash_v2`, `snapshot_identity.lineage_snapshot_hash_v2`,
  and a console log line), so the post-merge validation step below has v2
  material to compare without any further script changes.

---

## Post-merge production validation (next step, not part of this PR)

1. Run **Track R Production Capture** (`.github/workflows/track-r-production-capture.yml`)
   against production — Capture A.
2. Run it again — Capture B.
3. Compare `attestation_hashes.lineage_snapshot_hash_v2` between the two
   packages. They must be equal.
4. If they differ: stop. Produce a field-level comparison (the existing
   `pnpm track-r:lineage-cas-compare` three-way-compare script pattern
   generalizes directly to a two-way v2 compare) and do not begin
   governance. Do not attest.
5. If they match: freeze the later capture as the new immutable packet and
   begin governance restart — fresh ZEUS ADOPT, fresh EVE ADOPT, fresh human
   custodian consent. **Capture #5's prior consent must not be reused.**

The following may legitimately change between the two captures without
invalidating a v2 match (all outside the v2 hash by construction):
capture ID, operator cycle label, capture timestamp, accumulator MIC, GI,
last-deposit timestamp, watchdog audit timestamp.

The following must be verified unchanged: seal bodies and hashes, latest
attested seal, seal index, the 125 historical collision pairs, the 123
contested positions, the affected-block set, witness and resolution
evidence, and lineage pointers/classifications — i.e. every field in the v2
hash.

---

## Explicitly forbidden (unchanged by this PR)

Production KV mutation; `TRACK_R_BATCH_EXECUTION_ENABLED=true`;
`execution_authorized: true`; clearing the integrity gate; candidate
formation; reserve sealing; Fountain activation; sequence 361 promotion;
resolving or fabricating boundary 131→132; attesting Capture #6; deleting or
rewriting v1 historical evidence.

---

*"We heal as we walk." — Mobius Systems*
