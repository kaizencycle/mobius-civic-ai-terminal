# C-405 Handoff — CAS-v2 Authority Reconciliation

**Document ID:** `HANDOFF-C-405-CAS-V2-AUTHORITY-RECONCILIATION`  
**Cycle:** C-405  
**Date:** 2026-08-16  
**Custodian:** Michael (kaizencycle)  
**Status:** **ACTIVE — NON-EXECUTABLE**  
**Purpose:** Reconcile the governance-generation fork before any Track R production mutation. This document does **not** authorize KV writes.

---

## Opening verdict

C-403 established trustworthy production evidence. C-404 repaired the CAS identity model. C-404 ended with execution authority accidentally pointing backward to CAS-v1.

| Layer | State |
|-------|-------|
| Track R evidence | **v2-ready** (Capture #8/#9 stability confirmed) |
| Track R governance | **not v2-complete** (templates unsigned; archive incomplete) |
| Runtime execution gates | **v1-bound** (readiness, preflight, commitGuard) |
| Production mutation | **FORBIDDEN** |

**Authority fork (not evidence corruption):**

```
Valid v2 evidence packet (Capture #9)
        ≠
Currently activated v1 execution authority (Capture #7 / PR #675)
```

The first C-405 deliverable is this reconciliation handoff — **not** another production capture and **not** the mutation itself.

---

## Live posture at C-405 open (2026-08-16)

| Surface | Live state |
|---------|------------|
| Cycle | C-405 |
| Terminal health | degraded, HTTP 200 |
| GI | 0.71, yellow/stressed (`docs/catalog/heartbeats/2026-08-16T13-03-28-658Z-atlas.json`, `2026-08-16T13:03:28.658Z`) |
| ATLAS micro composite | 0.871 (same heartbeat; `micro_composite`, not vault GI) |
| KV / backup Redis | available |
| Integrity gate | active; hard stop enabled |
| Sealing | suspended |
| Fountain | locked |
| Collision pairs | 125 |
| Affected positions | 123 |
| Attested records examined | 319 |
| Seal/audit indexes | 360 / 360 |
| Canonical lineage | unresolved |
| Queued / current tranche | ~2,653.91 MIC |
| Projected slot 361 | 3.91 / 50 MIC |
| Production mutations (reviewed cycles) | **none** |

Live surfaces: `/api/health`, `/api/vault/status`, effective Canon.

**Do not misread degraded health as a blocker to governance work.** It accurately reflects GI 0.71 and the active collision tripwire. It is **not** permission to clear the gate or mutate KV outside the reconciled v2 path.

---

## Historical scan — how we got here

### C-403 (evidence foundation)

C-403 moved Track R from theory into reproducible production evidence:

- Batch collision-repair engine
- Fail-closed production witness capture
- Authenticated 248-record witness export
- Exact 123-position affected set
- Capture #5 immutable packet
- ZEUS/EVE ADOPT + human consent for Capture #5
- Execution-readiness and rollback structure

**Discovery:** CAS-v1 bound evidence-envelope metadata (`capture_id`, operator `cycle`) into the lineage identity hash. Identical production state could produce different v1 hashes. Capture #5 authorization is **historically valid** but **superseded for new execution** once the v1 defect was confirmed (PR #670).

### C-404 (identity repair)

| PR | Contribution |
|----|--------------|
| #670 | Deterministic reproduction of v1 drift |
| #672 | Additive semantic CAS-v2 (v1 history preserved) |
| #673 | Reviewed verifier + governance-packet structure |
| #674 | Completed v2 hash packet recorded |

Captures #8 and #9 independently produced the same v2 lineage hash:

```
b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb
```

Capture #9 (`track-r-c403-2026-08-15T2014Z`) is the **sole governance candidate**.

### C-404 regression (PR #675)

PR #675 created explicit execution authorization for **Capture #7** using **CAS-v1**:

| Field | Capture #7 (superseded for execution) |
|-------|---------------------------------------|
| Capture ID | `track-r-c403-2026-08-15T1919Z` |
| CAS-v1 | `d7f91f007c7334faefd8d8d1fbd2c0093610666c321777240de3e230b0a9bc00` |
| Execution witness (v1) | `eaeeff3866bdfd82a85ef933af5b8342bb2f15d05f79247b882a81d0d67f47af` |

Preflight run [31918026854](https://github.com/kaizencycle/mobius-civic-ai-terminal/actions/runs/31918026854) was **mechanically green** because both sides compared the same v1 value. It also **correctly computed** v2 (`b5f781…ef9fb`) but **did not gate** on it. See `docs/epicon/cycles/C-404/cas-probes/CAS-PROBE-31918026854.md`.

**PR #675 tooling remains valuable** (`--capture-id`, fail-closed binding, explicit authorization validation). **PR #675 execution authority does not.**

---

## Canonical v2 governance packet (Capture #9)

**Governance candidate:** `track-r-c403-2026-08-15T2014Z`  
**Archive (target):** `artifacts/C-404/track-r-lineage-v2/history/capture-2014Z/`  
**Provenance record:** `artifacts/C-404/track-r-lineage-v2/history/capture-2014Z/GITHUB_PROVENANCE.json`  
**Verification status:** `artifacts/C-404/track-r-lineage-v2/TRACK_R_V2_VERIFICATION_STATUS.md`

| Hash type | Value | Version |
|-----------|-------|---------|
| Lineage snapshot (CAS gate) | `b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb` | **v2** |
| Execution witness | `e08999decbcdaaac06d91a9a11f06e6737756a646800db90ad8e57b865c1ccf1` | **v2** |
| Semantic manifest | `27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa` | shared |
| Rollback manifest | `0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d` | shared |
| Production KV identity | `fc84f950ed17d3863e2f7d24eac6eb3c54a7434913a47aa49c7374cce296726e` | shared |

Stability witness (Capture #8): `track-r-c403-2026-08-15T2012Z` — same v2 lineage hash; **not** the governance candidate.

---

## Supersession table (execution authority)

| Document / artifact | Role | Execution status |
|---------------------|------|------------------|
| Capture #5 governance (C-403, v1) | Historical | Superseded — preserve for audit |
| Capture #7 authorization (`C404_EXPLICIT_EXECUTION_AUTHORIZATION.md`, v1) | PR #675 | **Superseded — non-executable** (runtime validator rejects) |
| CAS probe 31918026854 | Stability observation | Valid as v1 mechanical proof; **not** v2 authority |
| Capture #9 v2 packet | Governance candidate | **Pending** fresh ZEUS/EVE/human + runtime activation |
| v2 attestation templates (`artifacts/C-404/track-r-lineage-v2/*_TEMPLATE.md`) | Governance shell | **Unsigned** — must not be reused as verdicts |

C-403 ZEUS/EVE/human verdicts for Capture #5 **must not** be copied onto Capture #9. Fresh, independent adjudication required.

---

## Runtime gap (confirmed on `main`)

| Component | Current behavior | Required for v2 execution |
|-----------|------------------|---------------------------|
| `resolveTrackRCaptureBinding()` | Returns package `lineage_snapshot_hash` (v1) | Must understand `lineage_snapshot_version: v2` |
| `computeFreshLineageSnapshotFromProduction()` | Gates `fresh_cas_match` on v1 only | Must gate on v2 hash |
| `verifyTrackRExecutionReadiness()` | Binds Capture #7 / v1 authorization path | Must bind Capture #9 / v2 |
| `runBatchApplyPreflight()` | Compares v1 attested hash | Must compare `b5f781…ef9fb` |
| `commitGuard` | Receives caller Boolean CAS match | Must validate version + exact hash via `assertLineageSnapshotVersionAccepted()` |
| `pnpm track-r:batch-apply` | **Does not exist** | Required only after P1 complete |
| `lineageSnapshotVersionGuard.ts` | Implemented, tested | **Not wired** into execution paths |

Reference: `docs/epicon/cycles/C-404/TRACK_R_LINEAGE_CAS_V2.md` — v2 observation was intentionally non-gating until governance restart.

---

## C-405 TODO (ordered)

### P0 — Freeze execution authority

- [ ] Keep `TRACK_R_BATCH_EXECUTION_ENABLED` false (default).
- [ ] Do **not** invoke production mutation.
- [ ] Do **not** clear the integrity gate.
- [ ] Do **not** form or promote sequence 361.
- [ ] Do **not** resolve boundary 131→132.
- [x] Mark Capture #7/v1 authorization superseded (see `C404_EXPLICIT_EXECUTION_AUTHORIZATION.md` banner + this handoff).
- [x] Fail-closed: `validateExplicitCaptureAuthorization()` rejects superseded documents at runtime.

### P1 — Complete the immutable v2 archive

- [ ] Add verbatim Capture #8 raw artifacts under `artifacts/C-404/track-r-lineage-v2/history/capture-2012Z/raw/`.
- [ ] Add verbatim Capture #9 raw artifacts under `artifacts/C-404/track-r-lineage-v2/history/capture-2014Z/raw/`.
- [ ] Verify artifact ZIP digests (Capture #8: `sha256:f94f0a1a…`; Capture #9: `sha256:5a4e344a…`).
- [ ] Run the v2 stability verifier from a clean checkout against archived bytes:

```bash
pnpm exec tsx scripts/track-r-capture-v2-stability-verify.ts \
  --capture-a artifacts/C-404/track-r-lineage-v2/history/capture-2012Z/raw \
  --capture-b artifacts/C-404/track-r-lineage-v2/history/capture-2014Z/raw
```

- [ ] Commit machine-readable verifier output.
- [ ] Record Capture #9 as sole governance candidate in archive provenance.

### P1 — Obtain fresh v2 governance

- [ ] ZEUS independently verifies Capture #9 → ADOPT / CHALLENGE / OVERTURN (`ZEUS_V2_ATTESTATION_TEMPLATE.md`).
- [ ] EVE independently reviews identical v2 packet (`EVE_V2_ATTESTATION_TEMPLATE.md`).
- [ ] Require evidentiary independence — do not copy C-403 Capture #5 verdicts.
- [ ] After dual ADOPT: custodian records human consent bound to exact v2 packet (`HUMAN_V2_CONSENT_TEMPLATE.md`).
- [ ] Keep consent **non-executable** until runtime activation PR merges.

### P1 — Build CAS-v2 runtime activation (one corrective PR)

Wire execution paths to v2 without rewriting v1 history:

1. Add `lineage_snapshot_version` to capture bindings.
2. Make Capture #9/v2 an explicit supported binding (`track-r-c403-2026-08-15T2014Z`).
3. Reject missing, v1, mixed, or unknown versions for **new** execution attempts.
4. Bind readiness CAS gate to `b5f781…ef9fb`.
5. Bind apply-preflight CAS gate to `b5f781…ef9fb`.
6. Bind execution witness to `e08999…ccf1` (v2 contract).
7. Make `commitGuard` receive and validate version + hash — not a caller-supplied Boolean alone.
8. Recompute CAS inside the final apply boundary (dual CAS preserved).
9. Preserve v1 verification strictly for historical evidence (Capture #5/#7 archives).

**Expected read-only preflight headline after activation:**

```text
Lineage snapshot version: v2
Attested CAS:  b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb
Fresh CAS:     b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb
Commit guard:  pass
Execution authorized: false
Production mutation performed: false
```

Default workflow `--capture-id` must become `track-r-c403-2026-08-15T2014Z`.

### P2 — Close evidence-language gaps

- [ ] Do **not** claim cross-capture execution-witness stability (verifier only cross-compares lineage v2).
- [ ] Independently confirm 125 collision-pair count from raw packet bytes.
- [ ] Independently confirm boundary 131→132 remains excluded.
- [ ] Replace custodian-reported-only evidence with direct archived-byte verification where possible.
- [ ] Reconcile authority docs so only one active execution story exists post-activation.

### P2 — Implement one-shot apply path

**Only after P1 governance + activation:**

- [ ] Add `pnpm track-r:batch-apply`.
- [ ] Require explicit operator invocation + `TRACK_R_BATCH_EXECUTION_ENABLED=true`.
- [ ] Require exact manifest and v2 witness bindings.
- [ ] Require mutation journal + verified rollback plan.
- [ ] Dual CAS: operator preflight + apply-time recomputation; abort on any mismatch.
- [ ] Scope: positions 1–131 only; preserve competing evidence; 132–194 unattached; sequence 361 prohibited.

### P3 — Final execution window

1. Deploy v2 activation PR; let production stabilize.
2. Run read-only preflight with Capture #9; require v2 headline above.
3. Issue separate one-shot execution handoff (non-executable until signed).
4. Execute once.
5. Immediately run post-write watchdog.
6. Publish mutation receipt or rollback evidence.

---

## Explicitly forbidden (C-405)

- Production KV mutation before v2 authority reconciliation completes
- Reusing Capture #5 or Capture #7 consent for v2 execution
- Treating PR #675 preflight green as v2 authorization
- Clearing integrity gate, sealing, or Fountain activation outside reconciled path
- Fabricating ZEUS/EVE/human verdicts from templates without independent review
- Claiming `execution_authorized: true` from read-only probes

---

## Maintenance debt (non-blocking)

| Item | Action |
|------|--------|
| Substrate PR #419 | Triage — 194-block cold-canon proposal predates resolved Track R strategy |
| Draft PR #385 | Close or refresh |
| Degraded health label | **Preserve** — accurately reflects GI 0.71 + collision tripwire |

---

## Operator sequence (corrected)

```
C-405 opens (this handoff)
        ↓
P0 freeze confirmed
        ↓
P1: archive Capture #8/#9 raw artifacts + verifier output
        ↓
P1: fresh ZEUS → EVE → human on Capture #9 v2 packet
        ↓
P1: runtime activation PR (v2 gates wired; still zero writes)
        ↓
Read-only preflight rerun (Capture #9; v2 headline required)
        ↓
P2: implement track-r:batch-apply
        ↓
P3: separate one-shot execution handoff → single mutation → post-write audit
```

**Do not skip to the bottom.** A v1-green preflight is not a shortcut.

---

## Anchors

| Path | Purpose |
|------|---------|
| `docs/epicon/cycles/C-404/TRACK_R_LINEAGE_CAS_V2.md` | v2 domain design |
| `artifacts/C-404/track-r-lineage-v2/TRACK_R_V2_VERIFICATION_STATUS.md` | Capture #9 verification status |
| `artifacts/C-404/track-r-lineage-v2/TRACK_R_V2_STABILITY_COMPARISON.json` | Stability comparison |
| `docs/epicon/cycles/C-404/C404_EXPLICIT_EXECUTION_AUTHORIZATION.md` | Superseded v1 authorization (historical) |
| `docs/epicon/cycles/C-404/cas-probes/CAS-PROBE-31918026854.md` | v1 mechanical green preflight evidence |
| `lib/watchdog/batchRepair/lineageSnapshotVersionGuard.ts` | Version safety rules (to wire) |

---

*"We heal as we walk." — Mobius Systems*
