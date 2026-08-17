# C-406 KV Key Audit

**Issue:** Heartbeat reported `kv_keys.ok: true` and seed HTTP 200 while `kv_keys_ok: false` persisted.

---

## Root cause

**Definition mismatch**, not Redis outage.

| Check | Pre-C-406 | Post-C-406 |
|---|---|---|
| `ok` | Primary Redis ping | Unchanged |
| `kv_keys_ok` | All ~23 `KV_KEYS` + extras must exist | **Continuity keys only** (4 seed keys) |
| `kv_keys_all_ok` | (same as old `kv_keys_ok`) | Full diagnostic enumeration |

### Continuity keys (seed minimum)

- `GI_STATE` → `gi:latest`
- `HEARTBEAT` → `heartbeat:last`
- `LAST_INGEST` → `ingest:last`
- `SIGNAL_SNAPSHOT` → `signals:latest`

Matches `POST /api/admin/seed-kv` and EPICON KV sync CI.

### Inverted semantics

**`LEDGER_CIRCUIT_OPEN`** — key is written only when circuit opens (failure path).  
**Absence = healthy (circuit closed).** Pre-C-406 treated absence as `false`, forcing aggregate failure despite nominal ops.

### Optional diagnostic keys

Cron-populated or failure-path keys (e.g. `MIC_SUSTAIN_STATE`, `GI_TREND`, `INTEGRITY_SIGNAL_LATEST`) were incorrectly required for `kv_keys_ok`. Their absence is often nominal.

---

## Evidence

- May 2026 heartbeats: 22/23 keys present, `LEDGER_CIRCUIT_OPEN: false` → aggregate false
- C-406 ZEUS: seed 200 OK + `kv_keys.ok: true` + `kv_keys_ok: false`

---

## Implementation

- `lib/kv/kvKeyHealth.ts` — `assessKvKeyHealth()`
- `GET /api/kv/health` exposes:
  - `kv_continuity_ok`
  - `kv_diagnostic_ok`
  - `kv_keys_ok` (alias of continuity)
  - `kv_keys_all_ok` (full diagnostic)
  - counts without key name enumeration (C-318 surface reduction preserved)

---

## Fail-closed behavior

When Redis unavailable: all booleans `null`.  
When continuity keys missing: `kv_continuity_ok: false`, `persistence_state: degraded` in `decision_state`.

Do not flip aggregate boolean without per-key evidence.
