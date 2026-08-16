# C-404 Explicit Execution Authorization

> **SUPERSEDED FOR EXECUTION (C-405):** This document authorized Capture #7
> (`1919Z`) under **CAS-v1** (`d7f91f…bc00`). C-404 established Capture #9
> (`2014Z`) as the **v2 governance candidate** (`b5f781…ef9fb`). PR #675
> preflight run 31918026854 was mechanically green on v1 but did **not** bind
> execution to the v2 packet. **Do not execute Track R under this authority.**
> Preserve historically; active reconciliation:
> `docs/epicon/cycles/C-405/HANDOFF_C-405_CAS_V2_AUTHORITY_RECONCILIATION.md`.

**Document ID:** `C-404-EXPLICIT-EXECUTION-AUTHORIZATION`  
**Cycle:** C-404  
**Date:** 2026-08-15  
**Time:** 19:19:00Z  
**Custodian:** Michael (kaizencycle)  
**Authorization mode:** Explicit (CAS probe workflow previously defaulted to capture #5; authorization by evidence review and manual verification)  
**Execution status:** **SUPERSEDED — NON-EXECUTABLE** (authority fork resolved under C-405)

---

## Executive Summary

Track R step 6 (KV lineage mutation) is authorized for execution when the apply path is available. Governance gates (ZEUS/EVE/human) are filed. Capture #7 hashes are locked and verified. Production state at authorization time showed ~2610 MIC queued and the integrity gate holding correctly.

The execution preflight workflow previously defaulted to Capture #5 attestation hashes. Capture #7 binding is now committed under `artifacts/C-403/track-r-live-dry-run/history/capture-1919Z/` and the preflight workflow accepts `--capture-id`.

**Operator truth:** `pnpm track-r:batch-apply` (production KV mutation) is **not yet implemented** in this repository at authorization time. Only read-only preflight probes exist (`track-r:execution-readiness`, `track-r:batch-apply-preflight`). Do not claim step 6 complete until apply-path mutation lands and passes apply-time CAS with these hashes.

---

## Governance Attestations (Filed)

| Sentinel | Verdict | Filed at | Status | Document |
|----------|---------|----------|--------|----------|
| **ZEUS** | ADOPT | 2026-08-15T13:28:00Z | ✅ Confirmed | PR #664 |
| **EVE** | ADOPT | 2026-08-15T13:28:00Z | ✅ Confirmed | PR #664 |
| **Human** | CONSENT | 2026-08-15T14:07:00Z | ✅ Confirmed | PR #666 |

---

## Capture #7 Evidence (Locked & Verified)

**Capture metadata:**

```
Capture ID:                track-r-c403-2026-08-15T1919Z
Timestamp:                 2026-08-15T19:19:36.643Z
Capture mode:              production_witness_read_only
Executive status:          READY_FOR_ZEUS_EVE_REVIEW
Process exit code:         0 (success)
Live witness:              ok
Affected block set match:  true (123/123)
Execution authorized:      false (awaiting apply path — governance now satisfied)
```

**Deterministic hashes (locked):**

| Hash type | Value |
|-----------|-------|
| **Lineage snapshot hash (CAS gate, v1)** | `d7f91f007c7334faefd8d8d1fbd2c0093610666c321777240de3e230b0a9bc00` |
| **Execution witness hash** | `eaeeff3866bdfd82a85ef933af5b8342bb2f15d05f79247b882a81d0d67f47af` |
| **Semantic manifest hash** | `27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa` |
| **Rollback manifest hash** | `0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d` |
| **Telemetry snapshot hash** | `63035c3df839b97f5cc14d7b30d0ba9faa3cf157e06284f41e9e28f30f801fea` |

Archive: `artifacts/C-403/track-r-live-dry-run/history/capture-1919Z/`

---

## CAS Probe Workflow Issue (Resolved in tooling)

**Issue:** Track R Execution Preflight workflow did not accept `capture_id`; it defaulted to Capture #5 (`0123Z`).

**Remediation:** Workflow dispatch input `capture_id` + CLI `--capture-id` flag. Use `track-r-c403-2026-08-15T1919Z` at the mutation window.

**Preflight command (read-only):**

```bash
pnpm track-r:execution-readiness \
  --capture-id track-r-c403-2026-08-15T1919Z

pnpm track-r:batch-apply-preflight \
  --capture-id track-r-c403-2026-08-15T1919Z
```

---

## Custodian Authorization

I, **Michael (kaizencycle)**, custodian of Mobius Substrate and sole operator of Track R reconciliation, hereby authorize **Track R step 6 execution** with the following locked hashes when the apply path is available:

### Approved manifest (locked)

```
approved_manifest_hash: 27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa
```

### Locked hashes for batch apply

```
lineage_snapshot_hash:   d7f91f007c7334faefd8d8d1fbd2c0093610666c321777240de3e230b0a9bc00
execution_witness_hash:  eaeeff3866bdfd82a85ef933af5b8342bb2f15d05f79247b882a81d0d67f47af
semantic_manifest_hash:  27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa
rollback_manifest_hash:  0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d
```

### Intended execution command (when apply path ships)

```bash
pnpm track-r:batch-apply \
  --approved-manifest-hash 27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa \
  --lineage-snapshot-hash d7f91f007c7334faefd8d8d1fbd2c0093610666c321777240de3e230b0a9bc00 \
  --execution-witness-hash eaeeff3866bdfd82a85ef933af5b8342bb2f15d05f79247b882a81d0d67f47af \
  --mode production
```

### Authorization scope

Limited to **step 6 KV lineage mutation only**. Steps 7 (audit) and 8 (spine reconciliation) require independent verification.

### Witness signature

```
Custodian:  Michael (kaizencycle)
Timestamp:  2026-08-15T19:19:00Z
Signature:  ATLAS_AUTHORIZED_STEP_6_MUTATION
```

---

*"We heal as we walk." — Mobius Systems*
