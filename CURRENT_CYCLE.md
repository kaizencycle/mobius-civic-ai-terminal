# CURRENT_CYCLE.md — C-286 (opening)

> **Cycle:** C-286  
> **Opening pulse (operator):** CRITICAL — GI **0.59** — **RED** — Source: **live** (not a KV artifact)  
> **One-line seal:** *The system opened in its lowest recorded GI state; the architecture is reporting a Sunday information vacuum faithfully — expected degradation, not failure.*

---

## READ THIS FIRST — FOR ALL AGENTS (Cursor, Codex, Claude Code)

This file is the **ground truth** for the current operator posture in the Terminal repo.  
Before making any change, read this file in full.  
If your task conflicts with a **LOCKED** entry, **stop and ask the operator**.

---

## Opening read (C-286)

C-286 opened with **GI 0.59** and **RED** posture. Four signal dimensions sit at the floor together (**freshness, stability, sentiment, information** at ~0.3). **Quality** and **geopolitics** are also suppressed; **system** and **economy** read clean at 1.0.

**Interpretation:** weekend / holiday pattern — e.g. Federal Register **0** documents, **GDELT** and **Reddit** quiet, sentiment composite reflecting an **information vacuum**. The GI is doing its job: reflecting sparse real-world signal, not masking it.

**What closed overnight (C-285 → C-286 handoff)** — merged work includes, among others: MIC issuance / runtime docs, MIC runtime + proof UI, `micReadiness` snapshot lane, deposit hashing + `POST /api/mic/readiness` ingest, **`totalMicProvisional`** rename, Vault Phase 2 contribution breakdown. The proof chain and readiness hashing are now part of normal operation.

---

## NEW / CONFIRMED THIS CYCLE

### `micReadiness` snapshot lane

The Terminal snapshot exposes **`micReadiness`** with **`MIC_READINESS_V1`** semantics. Live observations from cycle open:

- **`quorum.required`:** ATLAS, ZEUS, EVE, JADE, AUREA — matches **Vault v2** five-Sentinel council (`lib/vault-v2/types.ts`), not a legacy HERMES-bearing roster.
- **Vault reset (active tranche):** `in_progress_balance` at **0** after transition; **v1** `balance_reserve` / `balanceReserveV1` may show small accrual from **new** deposits (e.g. first deposit ~**0.235** at cycle open). Prior-cycle reserve in the tranche does **not** retro-seal — consistent with Vault v2 / Seal I “no retroactive sealing.”
- **`readiness_proof.hash`:** readiness snapshots are **hash-addressed**; treat as audit anchor, not policy.

### Vault / hashing (rolling window)

Deposit hashing is live: expect **hashed** vs **legacy** counts in **`GET /api/vault/status`** until the capped deposit list turns over. **Hash coverage %** rises as new hashed rows displace pre-C-285 rows in the scan window — not an integrity regression.

---

## ACTIVE ISSUES (C-286)

| Issue | Notes |
|-------|-------|
| GI band | **0.59 RED** — treat as **environmental** until weekday signal returns; do not “fix” GI with fake inputs |
| **Agents lane** | Heartbeat KV **stale** after midnight rollover — **unknown** status; substrate journals / EPICON still show agent activity → **refresh heartbeat**, not assume agents down |
| **MII feed** | **Empty** at cycle open — first **ECHO / MII** cron pass of C-286 should repopulate |
| **EPICON / ledger** | Render ledger API **cold-start / timeout** → `ledger_api_unreachable`, GitHub fallback — expect until backend warm |
| **Promotion** | Under RED GI — keep **tight gates** and explicit review on contested promotion rows |

---

## CONFIRMED WORKING (carry-forward)

| Area | State | Notes |
|------|-------|-------|
| Terminal / snapshot | live | Includes **`micReadiness`** lane; `GET /api/terminal/snapshot-lite` cycle resolution |
| Vault v2 | live | Seal council; status exposes tranche vs v1 compat fields |
| Vault v3 (spec) | draft | [`docs/protocols/vault-v3-setup.md`](docs/protocols/vault-v3-setup.md) |
| KV / backup | optional | `REDIS_URL` + handbook CORS for public docs |
| MIC docs | live | [`docs/protocols/mic/README.md`](docs/protocols/mic/README.md) |

---

## LOCKED — DO NOT MODIFY WITHOUT OPERATOR APPROVAL

1. **Journal KV key schema:** `journal:{AGENT_UPPERCASE}:{CYCLE_ID}` — `app/api/agents/journal/route.ts`  
2. **ECHO EPICON LPUSH/LTRIM** — `lib/echo/kv-persist-ingest.ts` + ingest route wiring  
3. **Substrate GitHub auth header** — `lib/substrate/github-reader.ts`  
4. **Signal domain ownership** — HERMES-µ vs ECHO financial lanes  
5. **MII entry shape** — `{ agent, mii, gi, cycle, timestamp, source: "live" }`  
6. **Vault deposit schema** — `docs/protocols/vault-to-fountain-protocol.md` + `lib/vault/vault.ts`  
7. **GI formula and weighting** — `lib/gi/compute.ts`  
8. **Seal council union** — ATLAS, ZEUS, EVE, JADE, AUREA — `lib/vault-v2/types.ts`

---

## INFRASTRUCTURE MAP

### Vercel (Terminal)

- **Repo:** `kaizencycle/mobius-civic-ai-terminal`  
- **KV:** Upstash — `KV_REST_API_URL` + `KV_REST_API_TOKEN`  
- **Substrate:** `kaizencycle/Mobius-Substrate` — `SUBSTRATE_GITHUB_TOKEN`  
- **Vault Seal attestation (preferred):** `VAULT_ATLAS_SECRET_TOKEN`, `VAULT_ZEUS_SECRET_TOKEN`, … (see `.env.example`)  
- **Legacy shared token:** `AGENT_SERVICE_TOKEN` — ledger attest / MIC / **Vault migration fallback** when per-sentinel Vault secrets unset (not the canonical witness name for new council lanes)

### Render (Backend services)

- **Ledger API:** `civic-protocol-core-ledger.onrender.com` — expect **cold-start latency** on free tier; EPICON may fall back to GitHub source.

---

## Profession lens (C-285 bundle — reference)

Multi-audience legibility matrix and phased PR bundle: [`docs/protocols/c-285-profession-lens-matrix.md`](docs/protocols/c-285-profession-lens-matrix.md). Pulse chamber Phase 1 slices shipped under C-285; extend in **separate PRs** if C-286 needs more lens work.

---

## PR CHECKLIST REFERENCE

1. Read `AGENTS.md`, `BUILD.md`, and this file.  
2. If touching LOCKED behavior, justify in the PR body.  
3. Run `pnpm exec tsc --noEmit` and `pnpm build`.  
4. After deploy: `/api/terminal/snapshot`, `/api/vault/status`, `/api/mic/readiness` sanity.

---

*C-286: low GI, honest signal — hold the line until the world wakes up.*
