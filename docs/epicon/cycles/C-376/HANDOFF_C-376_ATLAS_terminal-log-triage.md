# ATLAS Handoff — C-376 Terminal Log Triage & Federation State

**Cycle:** C-376 (2026-07-18)  
**Author:** ATLAS (orchestration sentinel)  
**Ledger ID:** `mobius:substrate:atlas-handoff-c376-terminal-log-triage`  
**Witnessed at:** 2026-07-18T14:10Z (UTC)  
**Constraint:** Read-only federation scan + supplied Vercel logs. No KV mutation, no merge, no seal.

> *An agent's completion report is a claim, not a verification.* Verdicts are against git refs and published state files unless marked **UNVERIFIED**.

---

## Executive verdict

The hourly `kv-watchdog` 409 storm is **two stacked, correctly-behaving gates** — not a regression. C-376 is **open and unclosed**: GI is **disputed** across six surfaces; vault is **triple-blocked** (collision gate + missing attest route + sub-threshold GI).

**119 → 125 collisions:** fuller Gate G3 capture, **stable** — not live leak. Reconciliation still P0 (1 of 194 block groups drafted).

---

## Witness table (summary)

| # | Claim | Verdict |
|---|-------|---------|
| 1 | `kv-watchdog` six 409s 12:40–13:30Z | **TRUE** |
| 2 | Two gates: identity timeout + seal-integrity | **TRUE** |
| 3 | Seal gate reports 125 hash-divergent collisions | **TRUE** |
| 4 | 125 is new writes past 119 baseline | **FALSE** (stable Gate G3) |
| 5 | Collision state durable production | **TRUE** |
| 6 | Seal gate fail-closed (no deposit formed) | **TRUE** |
| 7 | Identity login timing out (not 401) | **TRUE** |
| 8 | Timeouts = Render cold-start | **INFERRED** |
| 9 | CPC ledger API healthy | **TRUE** |
| 10 | Identity SQLite root cause resolved | **FALSE / UNVERIFIED** |
| 11 | C-376 ledger-verified GI | **FALSE (DISPUTED)** |
| 12 | GI ≥ 0.95 Fountain threshold | **FALSE** |
| 13 | Quorum sealing for block 361 | **FALSE** (`POST /api/vault/attest` 404) |
| 14 | AUREA full tier | **FALSE** (Haiku cooldown) |
| 15 | Sweep dispute abort is bug | **FALSE** (fail-safe) |
| 16 | Substrate `cycle.json` C-376 aligned | **STALE** |
| 17 | Terminal `CURRENT_STATE.md` current | **STALE** |
| 18 | Cold-canon manifest current | **STALE** |
| 19 | Micro cycle aligned (C-376 vs C-306) | **FALSE** |

---

## GI readings (C-376) — disputed

| Source | GI | Verified? |
|--------|-----|-------------|
| ATLAS heartbeat (14:01Z) | 0.91 | self-report, not ledger-attested |
| ATLAS heartbeat (11:04Z) | 0.70 | seed degraded |
| micro signals | 0.89 | cycle **C-306** |
| integrity-status | 0.81 | `verified: false` |
| Substrate pulse | 0.71 | derived |
| Substrate cycle.json | 0.90 | carry-forward |

**Spread: 0.70 – 0.91.** No canonical GI for C-376.

---

## Blockers (ranked)

**P0 — Vault triple-blocked**
1. `POST /api/vault/attest` **404** — quorum cannot register (0/5). *Terminal PR #630 adds alias → `/api/vault/seal/attest`.*
2. **125 collisions** — seal-integrity gate closed. Track R: 1/194 drafted.
3. **GI < 0.95** — Fountain locked; `sustain_cycles_met: false`.

**P0 — Identity login timeouts** (intermittent; durable `DATABASE_URL` not evidenced)

**P1 — C-376 open** (`ledger_verified: false`)

**P1 — AUREA on Haiku** (credit cooldown)

**P2 — Instrument degradation** (gaia-usgs-water, freshness 0.6, micro cycle divergence)

**P3 — Cold-canon stalled** (correctly blocked behind reconciliation)

---

## Recommended dispositions

1. **Deploy attest endpoint** — alias at `/api/vault/attest` (PR #630). Verify GET 200; POST still gated.
2. **Probe identity liveness** before reprovisioning service account.
3. **Do not treat 0.91 as canonical** — hold GI DISPUTED until ledger-verified close.
4. **Advance Track R** past block 1 (only path to open seal gate).
5. **Restore AUREA tier** before quorum-dependent work.
6. **Leave sweep and kv-watchdog alone** — failing safe is correct.
7. **C-376 EPICON dir** — filed under `docs/epicon/cycles/C-376/`.

---

## C-376 artifact index (Terminal)

| File | Purpose |
|------|---------|
| `RESERVE_BLOCK_TRUTH_SURFACE.md` | Truth-surface audit + acceptance criteria |
| `EPICON_C-376_TERMINAL_reserve-block-truth-surface_v1.md` | Intent publication (PR #630) |
| `HANDOFF_C-376_ATLAS_terminal-log-triage.md` | This witness |

---

## Provenance

Shallow clone of five federation repos; grep C-376; read cycle/state/journal/heartbeat files; cross-check Vercel logs 2026-07-18T12:36–13:36Z. No live KV probe — identity availability **INFERRED**.
