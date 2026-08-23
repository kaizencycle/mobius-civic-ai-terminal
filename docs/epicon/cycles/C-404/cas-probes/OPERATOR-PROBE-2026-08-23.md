# Track R Operator Probe — 2026-08-23

**Session:** Cloud agent read-only audit (no KV credentials in agent environment)  
**Governance candidate:** `track-r-c403-2026-08-15T2014Z`  
**Attested v2 lineage CAS:** `b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb`  
**Last successful live CAS probe:** [run 32091830992](https://github.com/kaizencycle/mobius-civic-ai-terminal/actions/runs/32091830992) (2026-08-18) — `fresh_cas_match: true`, `apply_preflight_pass`

---

## Summary

| Check | Result | Notes |
|-------|--------|-------|
| Repo-local v2 stability (Capture #8/#9) | **PASS** | `pnpm track-r:capture-v2-stability-verify` |
| Repo-local lineage CAS three-way compare | **PASS** | Volatile fields (`capture_id`, `cycle`) isolated; attested CAS stable |
| Production public APIs (seal tip) | **HEALTHY** | `seal-C-372-002`, 360 attested, 0 quarantined |
| Production `migrate-v1` guard | **PASS** | `v1Count: 0` — no real v1 seals |
| Canon quarantine UI (`reattest-bulk`) | **FALSE POSITIVE** | Lists `latest` as legacy v1 until PR #696 deploys |
| Live CAS probe (local agent) | **BLOCKED** | Missing `KV_REST_API_URL` / `KV_REST_API_TOKEN` |
| Production mutation | **NOT AUTHORIZED** | `execution_authorized: false` on integrity-status |

**Action required:** Custodian must dispatch **Track R Execution Preflight** in GitHub Actions for a fresh live CAS probe before any mutation window.

---

## 1. Repo-local verification (no KV required)

### v2 capture stability

```bash
pnpm track-r:capture-v2-stability-verify \
  --capture-a artifacts/C-404/track-r-lineage-v2/history/capture-2012Z \
  --capture-b artifacts/C-404/track-r-lineage-v2/history/capture-2014Z
```

**Result:** OVERALL PASS — both captures recompute to attested v2 CAS `b5f781f6…`, witness 248/248 MATCH.

### Lineage CAS three-way compare

```bash
pnpm track-r:lineage-cas-compare
```

**Findings:**

- Capture #5 (`0123Z`) and Capture #6 (`1706Z`) differ only in `capture_id` and `cycle` on the capture path.
- Simulated 16:56 preflight hash `d0880d29…` matches when `capture_id` or `cycle` alone is normalized to attested values.
- Telemetry fields (`gi_current`, `unsealed_accumulator_mic`, timestamps) are **outside** lineage hash — confirmed non-lineage drift.
- Attested governance CAS remains **`b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb`**.

---

## 2. Production public API probes (2026-08-23T14:54Z)

Base URLs tested: `https://mobius-civic-ai-terminal.vercel.app` and `https://terminal.mobius-substrate.com` (identical responses).

| Endpoint | Key fields |
|----------|------------|
| `GET /api/vault/seal-status` | `latest_seal: seal-C-372-002`, `seals_attested_total: 360`, `seals_quarantined_total: 0` |
| `GET /api/vault/migrate-v1` | `v1Count: 0`, `v1Seals: []` |
| `GET /api/vault/reattest-bulk` | `v1Count: 1`, `v1Seals: ["latest"]` — **audit bug, not real v1 seal** |
| `GET /api/substrate/effective-state` | Tip `seal-C-372-002` attested; no mutation receipts |
| `GET /api/integrity-status` | `execution_authorized: false`, `mutation_state: forbidden`, `kv_continuity_ok: true` |

### `vault:seal:latest` pointer

- Public APIs show a healthy attested tip (`seal-C-372-002`).
- `reattest-bulk` false positive is caused by naive `!schema_version` check matching the CAS pointer key `latest` (fixed in PR #696).
- **Do not run migrate-v1 on `latest`** — guard correctly returns `reserved_seal_id`.
- If KV inspect shows a corrupted object (per-character keys) instead of bare string, follow `docs/runbooks/vault-seal-latest-pointer-repair.md`.

---

## 3. Live CAS probe (requires GitHub Actions)

Local probes fail without Upstash secrets:

```text
✗ fresh_production_kv_identity — primary Upstash Redis client unavailable
✗ apply_production_kv_identity — same
→ Preflight status: apply_blocked
```

### Dispatch preflight (custodian)

1. GitHub → **Actions** → **Track R Execution Preflight** → **Run workflow**
2. Inputs:
   - `probe`: **both**
   - `capture_id`: `track-r-c403-2026-08-15T2014Z`
   - `skip_cas_probe`: **false**
   - `base_url`: `https://mobius-civic-ai-terminal.vercel.app`
3. Expected pass at mutation window:
   - Probe 1 → `awaiting_execution_handoff`, `Fresh CAS match: true`
   - Probe 2 → `apply_preflight_pass`, `Commit guard preflight: pass`
4. Workflow commits probe report to `docs/epicon/cycles/C-404/cas-probes/CAS-PROBE-<run_id>.md`

> Last probe is **5 days stale** (2026-08-18). Fresh probe required immediately before P3 handoff.

---

## 4. Track R execution posture

| Phase | Status |
|-------|--------|
| P1 — Governance triad + read-only preflight | ✅ Complete (ZEUS/EVE/Human signed; run 32091830992) |
| P2 — `pnpm track-r:batch-apply` executable path | ✅ Implemented; dry-run default |
| P3 — One-shot execution handoff | **Blocked** — needs P2 deploy + fresh preflight at mutation window |
| Production mutation | **FORBIDDEN** until explicit env arming + signed handoff |

Reference: `docs/epicon/cycles/C-405/HANDOFF_C-405_CAS_V2_AUTHORITY_RECONCILIATION.md`

---

## 5. Related PRs

| PR | Purpose |
|----|---------|
| [#696](https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/696) | Fix Canon quarantine false `latest` v1 classification — merge + deploy |
| [#695](https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/695) | C-411 Sentinel Review fail-closed + EVE degraded routing |

---

*"We heal as we walk." — Mobius Systems*
