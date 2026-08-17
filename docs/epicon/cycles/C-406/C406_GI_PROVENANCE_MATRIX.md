# C-406 GI Provenance Matrix

**Purpose:** Explain observed GI divergence without guessing cache lag vs drift.

---

## Observed divergence (2026-08-17 scan)

| Representation | Value | Source tier | Notes |
|---|---:|---|---|
| ATLAS / KV | 0.771 | `kv-live` | Heartbeat reads `gi:latest` from sweep |
| integrity-status | 0.81 | `cached` / `kv-carry` | Route cache + carry-forward tier |
| live micro | 0.881 | `live-compute` | Registry sweep, 40 instruments, weighted |

**Maximum delta:** ~0.11

---

## Authority chain (read order)

1. **`/api/signals/micro`** — live instrument sweep (highest freshness, different formula)
2. **`resolveGiChain()`** — KV live (≤10 min) → live compute → KV carry → OAA bridge → readiness fallback
3. **`computeIntegrityPayload()`** — KV read with 15 min freshness window; ECHO+freshness+tripwire formula on miss
4. **Cron sweep → `saveGiStateFromMicroSweep()`** — unweighted agent average (writes KV)

---

## Root causes

### 1. Different formulas

| Path | Formula |
|---|---|
| Micro route | Weighted agent composites (`AGENT_WEIGHTS`) |
| Integrity compute | `0.35×quality + 0.25×freshness + 0.20×stability + 0.20×system` |
| Sweep → KV | Unweighted average of per-agent micro poll scores |

### 2. Different timing

- Micro route: 60s KV cache + live fetch on miss
- integrity-status: 60s route cache + 120s CDN + KV row age up to 15 min
- ATLAS heartbeat: reads KV at sweep time (may lag live micro)

### 3. Stale mode/status on KV read (repaired C-406)

Pre-C-406: stored `mode`/`terminal_status` could diverge from numeric GI after hysteresis.  
Post-C-406: `/api/integrity-status` re-derives mode from GI and exposes `gi_representation.stored_mode` when diverged.

---

## `gi_representation` fields (C-406)

Every GI consumer should expose:

| Field | Description |
|---|---|
| `value` | Numeric GI |
| `computation_source` | Chain tier (`kv-live`, `live-compute`, …) |
| `persistence_source` | Legacy bucket (`kv`, `cached`, `live`) |
| `computed_at` / `persisted_at` | ISO timestamps |
| `cache_age_seconds` | Age of persisted row |
| `freshness_class` | `fresh` / `stale` / `degraded` / `unknown` |
| `stored_mode` / `derived_mode` | KV copy vs band-derived |
| `instrument_count` / `failed_instrument_count` | Micro lane only |

---

## Acceptance criterion

A consumer reading `gi_representation` on both `/api/integrity-status` and `/api/signals/micro` can explain 0.771 / 0.81 / 0.881 without inferring corruption.

---

## Not corruption by default

Different timing and persistence semantics can produce large deltas. Dispute requires explicit reconciliation — not forced numerical equality.
