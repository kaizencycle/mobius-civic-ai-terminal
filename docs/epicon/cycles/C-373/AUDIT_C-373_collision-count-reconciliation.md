# C-373 Collision Count Reconciliation

**Cycle:** C-373  
**Operator:** ATLAS (Lane B — read-only evidence)  
**Captured:** 2026-07-16T00:30–00:31 UTC  
**Status:** Semantics explained · live re-audit **UNVERIFIED** (no production KV credentials in agent environment)

---

## Executive summary

The **119** and **125** figures use the **same counting rule** (hash-divergent **collision pairs** via `analyzeReserveBlockCollisions`). They are **not** silently interchangeable with **collision group** counts from C-373 `buildCollisionAuditReport`.

The +6 delta is **consistent with KV growth** between the C-370 audit snapshot and C-373 production watchdog observations. Exact seal-level proof requires an operator-run **pair-count** audit (`scripts/audit-reserve-block-collisions.ts`) against production KV — not `watchdog:collision-audit`, which emits **group** counts only.

**Verdict:** Counting semantics **resolved**. Absolute 125 reproduction **UNVERIFIED** until live KV audit.

---

## Required comparison table

| Artifact | Timestamp | Raw records | Unique `block_number` | Collision groups | Hash-divergent groups | Hash-divergent pairs | Counting rule |
|----------|-----------|-------------|----------------------|------------------|----------------------|---------------------|---------------|
| C-370 `collision-audit.json` (GH Actions) | 2026-07-13T00:00:13Z | 313 attested seals | **194** | **119** (blocks with ≥2 seals) | **119** (all groups hash-divergent) | **119** (`hash_divergent_collisions`) | **Pair tournament:** `analyzeReserveBlockCollisions` — N−1 pairwise entries per group; pairs where `seal_hashes_differ`. At C-370 every group had exactly 2 seals, so groups = pairs. |
| C-370 FINDINGS doc | 2026-07-13 | 313 | 194 | 119 (inferred from `collision_count`) | 119 | 119 | Same as above; sourced from workflow artifact |
| Production kv-watchdog (C-373 window) | ~2026-07-15 (custodian logs) | **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED** | **125** (`evidence.hash_divergent_collisions`) | `checkBlockCollisions` → `analyzeReserveBlockCollisions` (pair count) |
| C-373 `buildCollisionAuditReport` (PR #624 tooling) | N/A until operator run | — | `unique_block_count` | `collision_group_count` | `hash_divergent_group_count` | *not emitted* | **Group audit only** — one row per `block_number` with ≥2 seals; pair count requires `audit-reserve-block-collisions.ts` |
| Pre-repair `vault/status` witness | 2026-07-16T00:31:06Z | 360 `seals_count` / 319 examined attestation coverage | Not computed | Not computed | Not computed | Not computed | UI/dashboard aggregate — **not** a collision audit |

---

## Counting rules (do not conflate)

### Pair count (`hash_divergent_collisions`)

Used by:

- `scripts/audit-reserve-block-collisions.ts` (C-370 forensic CLI)
- `lib/watchdog/kvHealthChecks.ts` → `checkBlockCollisions` (production kv-watchdog)
- GitHub Actions `audit-reserve-block-lineage.yml` artifact

Algorithm (`lib/dat/reserveBlockCollisions.ts`): group attested seals by `sequence` (`block_number`). For each group with N≥2 seals, run a pairwise tournament producing **N−1 collision pair records**. Count pairs where `seal_hashes_differ`.

When every colliding group has exactly **two** seals, **pair count = group count**. When any group has **three or more** seals, **pair count > group count**.

### Group count (`hash_divergent_group_count`)

Used by:

- `lib/watchdog/collisionAudit.ts` → `buildCollisionAuditReport` (C-373 recovery tooling)
- `scripts/watchdog-collision-audit.ts`

One audit row per `block_number` with ≥2 attested seals. `hash_divergent_group_count` = groups where candidate `seal_hash` values are not all identical.

---

## Why 119 became 125

| Hypothesis | Mechanism | Status |
|------------|-----------|--------|
| **H1 — Temporal KV growth** | Additional attested seals landed between 2026-07-13 audit and C-373 watchdog runs; block uniqueness guard (Track D) not yet merged, so new hash-divergent pairs formed | **LIKELY** — `seals_count` grew 313 → 360 per pre-repair witness; seal integrity gate blocks new deposits but does not remove existing collisions |
| **H2 — N>2 seal groups** | Some `block_number` slots gained a third attested seal, adding extra pairs without new groups | **POSSIBLE** — requires live audit to confirm |
| **H3 — Counting semantics mismatch** | 119 uses groups, 125 uses pairs (or vice versa) | **FALSE** — both figures use pair-based `hash_divergent_collisions` |

**Delta:** 125 − 119 = **6** additional hash-divergent **pairs** (not necessarily 6 new block slots).

---

## Pre-repair production witness (immutable exports)

Captured read-only at C-373 Lane B preflight:

| File | Source URL | Notes |
|------|------------|-------|
| `artifacts/C-373/pre-repair/snapshot-lite-2026-07-16T003036Z.json` | `GET /api/terminal/snapshot-lite` | `deployment.commit_sha` = `09f1cab` (PR #624 merge) |
| `artifacts/C-373/pre-repair/vault-status-2026-07-16T003106Z.json` | `GET /api/vault/status` | `latest_seal_id: null` — integrity gate context; `seals_count: 360` |
| `artifacts/C-373/pre-repair/witness-manifest.json` | ATLAS export | Provenance index for this bundle |

**Not captured (requires operator + KV creds):**

- Pair-count export via `scripts/audit-reserve-block-collisions.ts --json` (validates live **125**)
- Group-count export via `pnpm watchdog:collision-audit` (receipt tooling only — does **not** validate pair count)
- `vault:seal:latest` raw KV value
- `watchdog:canonical:quarantined` / mutation journal head
- Live kv-watchdog response body (cron auth — HTTP 403 unauthenticated)

---

## Gate implications

| Check | State |
|-------|-------|
| Collision count semantics | **Explained** — pair vs group documented |
| Live 125 reproduction | **UNVERIFIED** |
| Production repair applied | **UNVERIFIED** — no post-repair audit artifact |
| Repair blocked until live audit | **TRUE** — operator must run dry-run audit first |

---

## Operator next step

Use **two** exports — they answer different questions:

```bash
# 1. PAIR COUNT — reproduces kv-watchdog hash_divergent_collisions (the live 125 gate)
#    From mobius-civic-ai-terminal with production .env.local KV credentials:
npx tsx scripts/audit-reserve-block-collisions.ts --json \
  > artifacts/C-373/pre-repair/collision-pairs-live.json

# Confirm: .hash_divergent_collisions in output (expect 125 if production unchanged)

# 2. GROUP COUNT — C-373 receipt/repair tooling (does NOT validate the 125 pair gate)
pnpm watchdog:collision-audit -- --out artifacts/C-373/pre-repair/collision-groups-live.json

# Compare: .hash_divergent_group_count (groups) vs .hash_divergent_collisions (pairs)
# If any block_number has N>2 attested seals, pair count > group count.
```

Do **not** run `watchdog:collision-repair --apply` until receipts are approved (human + EVE + ZEUS).

---

## Witness table

| Claim | Verdict | Evidence |
|-------|---------|----------|
| 119 and 125 use the same pair-based counting function | TRUE | `lib/dat/reserveBlockCollisions.ts`, `lib/watchdog/kvHealthChecks.ts`, C-370 FINDINGS |
| +6 is a semantic normalization artifact | FALSE | Same algorithm; temporal growth hypothesis |
| Group vs pair distinction documented | TRUE | This document + `collisionAudit.ts` schema |
| Live production audit confirms 125 | UNVERIFIED | No KV credentials in agent run; operator action required |
| Pre-repair deployment SHA captured | TRUE | `snapshot-lite` → `09f1cabf6440582c606b02d0e68cba606d0cecad` |
