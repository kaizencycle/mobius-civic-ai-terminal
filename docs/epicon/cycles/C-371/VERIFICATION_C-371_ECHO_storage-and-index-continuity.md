# VERIFICATION C-371 — ECHO Storage and Index Continuity

**Agent:** ECHO (runtime, storage, and index verifier)  
**Verified at:** 2026-07-13T15:18:33Z  
**Method:** Read-only production KV API, Substrate archive spot-check, index reproduction  
**Script:** [`scripts/c371-echo-verification.mjs`](../../../../scripts/c371-echo-verification.mjs)  
**Artifact:** [`artifacts/C-371/echo-verification.json`](../../../../artifacts/C-371/echo-verification.json)

---

## ECHO verdict

**`INDEX_VISIBILITY_INCOMPLETE`**

All 49 authoritative legacy seal IDs are present in production KV. No true storage gap was found for the legacy MIC tranche lineage or the C-307/C-308 boundary seals. Prior audit false negatives are fully explained by **incorrect ID construction**, **attested-only index filtering**, and **paginated audit index incompleteness** — not by missing bodies.

---

## Storage surface matrix (legacy authoritative set)

| Surface | Coverage | Notes |
|---------|----------|-------|
| Production KV direct (`GET /api/vault/seal/{id}`) | **49/49** | All `status: promoted` |
| Default attested index (`GET /api/vault/seal?limit=200`) | **0/49** | Expected — legacy seals are promoted, not attested |
| Audit scope index (`scope=audit&limit=200`) | Partial | 200 of 356 total; legacy IDs mostly outside newest-200 window |
| Substrate `Mobius-Substrate/seals/` archive | **1/49** | `seal-C-288-001` only (quarantined archive copy) |
| Promoted + KV coexistence | Normal | `seal-C-288-001`: archive `quarantined`, KV `promoted` — not a body conflict |

---

## False negative reproduction

### 1. Addressing failure — guessed IDs (`seal-C-307-00N`)

| Test | Result |
|------|--------|
| `seal-C-307-001` … `seal-C-307-035` | **35/35 HTTP 404** |
| Authoritative IDs (`LEGACY_SEAL_KV_RESET_IDS`) | **49/49 present** |

**Classification:** `ADDRESSING_FAILURE_REPRODUCED` — blocks 1–35 were never stored under a uniform `seal-C-307-*` prefix. Early-era IDs use changing cycle prefixes (C-288, C-292, … C-307).

### 2. Index visibility — attested-only orphan (`seal-C-308-042`)

| Check | Result |
|-------|--------|
| `seal-C-308-042` in KV | ✅ `attested` |
| `seal-C-307-041` in KV | ✅ `promoted` |
| `seal-C-307-041` in default attested index | ❌ absent |
| C-370 `orphan_prev` reproduced with attested-only traversal | ✅ **reproduced** |

**Root cause:** `lib/dat/sealHashLineage.ts` filters `status === 'attested'`. Predecessor exists in the same KV under `promoted` status. This is an **index visibility false negative**, not a storage gap.

### 3. Audit index pagination — incomplete seq 42–194 sample

| Check | Result |
|-------|--------|
| `GET /api/vault/seal?scope=audit&limit=200` total | 356 seals |
| Returned in one page | 200 |
| Sequences 42–194 missing from page | **25** (e.g. seq 132–141) |
| Direct fetch + hash-chain walk (ZEUS) | **153/153** present |

**Classification:** `INDEX_VISIBILITY_INCOMPLETE` — sorted-by-sequence analysis on a partial index page can fabricate discontinuity. Direct ID fetch and hash-chain walk confirm storage continuity.

---

## Boundary seal surface audit

| Seal | KV | Status | In attested default index | In audit 200-sample |
|------|----|--------|---------------------------|---------------------|
| `seal-C-307-041` | ✅ | `promoted` | ❌ | ❌ |
| `seal-C-308-042` | ✅ | `attested` | ❌ | ❌ |
| `seal-C-332-194` | ✅ | `attested` | ✅ | ✅ |

Boundary seals are stored and retrievable by authoritative ID even when absent from the default index window queried here.

---

## Corrected audit procedure (ECHO recommendation)

1. Use `LEGACY_SEAL_KV_RESET_IDS` as addressing authority for blocks 1–41.
2. Walk the attested fragment by `prev_seal_hash` from `seal-C-308-042`, not by sequence-sorted partial index.
3. Include `promoted` and `attested` statuses when validating predecessor links (per [`EPICON_C-371_PROPOSAL_lineage-audit-historical-index_v1.md`](./EPICON_C-371_PROPOSAL_lineage-audit-historical-index_v1.md)).
4. Do not infer absence from `seal-C-{latest_cycle}-{NNN}` ID guessing.

---

## What ECHO did not find

- No legacy authoritative ID returned 404 on direct KV fetch.
- No body/hash conflict between Substrate archive and KV for the one archived seal examined.
- No quarantined predecessor for the proven boundary when queried by correct ID.

---

## Non-negotiable boundary observed

No production KV writes, status changes, hash rewrites, or record mutations were performed.
