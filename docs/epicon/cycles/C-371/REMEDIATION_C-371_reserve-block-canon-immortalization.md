# Remediation — Reserve Block Canon Immortalization (Vault Empty)

**Cycle:** C-371  
**Symptom:** `/terminal/vault` shows zero immortalized reserve blocks — `total_dat_files: 0`, `chain_tip: null`  
**Verified:** 2026-07-14 UTC (live probes + `check_deploy_drift.py`)

---

## 1. Confirmed root cause

### Primary: CPC deploy drift (canon routes missing on live)

`main` registers canon reserve-block routes; **live Render does not serve them.**

```text
$ python3 scripts/check_deploy_drift.py --url https://civic-protocol-core-ledger.onrender.com
DRIFT: live is missing 6 expected operation(s):
  - GET  /api/canon/reserve-blocks/manifest
  - GET  /api/canon/reserve-blocks/verify
  - POST /api/canon/reserve-blocks/anchor
  - GET  /api/reserve-blocks/index
  - POST /api/reserve-blocks/anchor
  - GET  /pulse/state
```

Live probe (2026-07-14):

| Endpoint | Status |
|----------|--------|
| `GET /health` | 200 — `db_type: sqlite` |
| `GET /api/canon/reserve-blocks/manifest` | **404** |

**Effect on vault:** Terminal `GET /api/canon/reserve-blocks/manifest` proxies to CPC via `fetchCpcManifest()` (`lib/cpc/hashAnchor.ts`). CPC 404 → `null` → route returns zero shell. `AttestationStatus` renders empty canon state. **Git cold canon exists; ledger witness does not.**

### Secondary: July 12 canonization partial success

Cold canon **does exist** in `Mobius-Substrate` `canon/reserve-blocks/`:

| File | Range | SHA256 (prefix) |
|------|-------|-----------------|
| `blk0000.dat` | 1–100 | `sha256:67b78b11…` |
| `blk0001.dat` | 101–194 | `sha256:0ec62d17…` |
| `MANIFEST.json` | 194 blocks, 9,700 MIC | tip `sha256:2ccc5e41…` |

`postHashAnchor()` retried 3× against missing CPC route → **0 anchors registered**.

### Tertiary: Terminal env footgun (fixed in code)

`CIVIC_LEDGER_URL` in `.env.example` is a **full attest path** (`…/api/ledger/attest`). Old `cpcBaseUrl()` preferred it over `RENDER_LEDGER_URL`, producing malformed URLs like `…/api/ledger/attest/api/canon/reserve-blocks/manifest`. **Fixed:** `resolveCpcBaseUrl()` strips to host origin; prefers `CPC_BASE_URL` → `RENDER_LEDGER_URL`.

**Production action:** Set `CPC_BASE_URL=https://civic-protocol-core-ledger.onrender.com` in Vercel (do not rely on `CIVIC_LEDGER_URL` for canon).

### Quaternary: blocks 195–359 not in cold canon

359 seals attested in hot KV; cold manifest stops at **194**. Likely export halted at first sequence gap or validation failure during July 12 run — **not** resolved by redeploy alone. Requires separate Q3 MIC reconciliation / incremental canon export after anchor lane is live.

### Incidental: `kv_keys_ok: false`

Live terminal `GET /api/kv/health` (2026-07-14): `ok: true`, `kv_keys_ok: false` — at least one expected KV key missing. Does not block canon manifest proxy but worth triage in same ops pass.

---

## 2. Remediation sequence (order matters)

### Step 0 — Do not redeploy CPC first on ephemeral SQLite alone

`/health` reports `db_type: sqlite`. Render disk mounts `/var/lib/ledger` for **core** sqlite (`ledger.db` holds `dat_hash_anchors`), but vault layer also uses `DATABASE_URL`. Any redeploy without persistent Postgres risks wiping identity/vault state — same class as identity-login failures.

### Step 1 — Provision persistent Postgres on CPC

1. Create Render Postgres for `civic-ledger-api`.
2. Set `DATABASE_URL` on the CPC service **before** redeploy.
3. Confirm `/health` reports `db_type: postgresql` (or equivalent) after deploy.

### Step 2 — Redeploy CPC from current `main`

1. Trigger manual deploy on `civic-ledger-api`.
2. Verify drift checker returns **exit 0**:

```bash
cd Civic-Protocol-Core
python3 scripts/check_deploy_drift.py \
  --url https://civic-protocol-core-ledger.onrender.com
```

3. Smoke:

```bash
curl -sS https://civic-protocol-core-ledger.onrender.com/api/canon/reserve-blocks/manifest
curl -sS https://civic-protocol-core-ledger.onrender.com/api/canon/reserve-blocks/verify
```

### Step 3 — Re-post hash anchors (idempotent)

Re-run canon export **with CPC enabled** (or post anchors only from existing `.dat` files):

```bash
# From mobius-civic-ai-terminal — workflow or local:
CPC_BASE_URL=https://civic-protocol-core-ledger.onrender.com \
AGENT_SERVICE_TOKEN=... \
npx tsx scripts/canonize-reserve-blocks.ts
# Or GitHub Actions: reserve-block-canon-export.yml (ensure CPC_BASE_URL secret set; remove --skip-cpc if used)
```

Anchor endpoint is idempotent on same hash; 409 only on hash mismatch.

**Expected CPC manifest after replay:**

- `total_dat_files: 2`
- `total_blocks_anchored: 194`
- `chain_tip_hash: sha256:2ccc5e41…` (matches `MANIFEST.json`)

### Step 4 — Verify vault UI

1. `GET https://terminal.mobius-substrate.com/api/canon/reserve-blocks/manifest` — non-zero payload.
2. `/terminal/vault` → `AttestationStatus` shows `.dat` canonization aligned with 194 blocks.
3. Per-block **immortalized** still requires live substrate attestation (`substrate_attestation_id` + `substrate_event_hash`) — canon anchor ≠ per-seal immortalization, but manifest lane unblocks the canon column.

### Step 5 — Incremental canon for blocks 195+

After Q3 reconciliation resolves hot seal continuity:

```bash
npx tsx scripts/canonize-reserve-blocks.ts --incremental
```

Do **not** run full re-export while `block_number` collisions persist in KV (custodian guidance: audits/dry-run first).

---

## 3. C-372 structural question — drift tripwire status

**Is `fire_deploy_drift_routine.sh` wired?**

| Mechanism | Status |
|-----------|--------|
| `scripts/check_deploy_drift.py` | Exists; compares live OpenAPI to `scripts/expected_routes.json` (32 ops) |
| `.github/workflows/deploy-drift-alarm.yml` | **Scheduled daily 13:00 UTC** + `workflow_dispatch` |
| Exit 1 (DRIFT) | **Fails workflow** after routine fire attempt |
| Exit 2 (UNRESOLVED) / 4 (BLOCKED) | Warning only — does **not** fail |
| `fire_deploy_drift_routine.sh` | Manual wrapper; CI inlines equivalent `curl` |
| `deploy-drift-shim` (Render webhook) | Fires routine on deploy success — does not run drift check itself |

**Gap:** Drift checker exists and should catch this class, but:

1. If probe hits cold-start / IP allowlist → exit 2/4 → **silent pass**.
2. `ROUTINE_TRIGGER_ID` / `ROUTINE_TOKEN` may be unset → routine skipped, only workflow fail on exit 1.
3. Drift may have been firing in GitHub Actions without custodian visibility if notifications aren't wired.

**C-372 recommendation:** Promote deploy drift to **tripwire** status:

- Fail CI on exit 1 **and** post to custodian-visible channel (Slack/issue) unconditionally.
- Run `workflow_dispatch` drift check as **required gate** after every CPC production deploy.
- Consider failing on sustained exit 2 (e.g., 3 consecutive days UNRESOLVED).

---

## 4. Architecture reminder

Per C-357 doctrine:

> Cold `.dat` files in Git + hash anchor in CPC ledger = canon.  
> Git alone without CPC witness = **unattested** (vault correctly shows empty).

Immortalization in vault UI additionally requires per-seal live substrate attestation fields — two lanes:

| Lane | What it proves | Current state |
|------|----------------|---------------|
| `.dat` canon (C-357) | Cold file hash anchored in CPC | **Broken** — CPC 404 |
| Live attestation | Per-seal `substrate_attestation_id` + `substrate_event_hash` | Separate coverage metric |

---

*"We heal as we walk." — Mobius Systems*
