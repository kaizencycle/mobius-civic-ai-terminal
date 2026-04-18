# CURRENT_CYCLE.md — C-285 (opening)

> **Cycle:** C-285  
> **Opening pulse (operator):** DEGRADED — GI **0.75** — Tripwire **1 elevated** — Primary posture: **escalation active**  
> **One-line seal:** *C-285 opens degraded, but the sentinels are responding in order.*

---

## READ THIS FIRST — FOR ALL AGENTS (Cursor, Codex, Claude Code)

This file is the **ground truth** for the current operator posture in the Terminal repo.  
Before making any change, read this file in full.  
If your task conflicts with a **LOCKED** entry, **stop and ask the operator**.

---

## Opening read (C-285)

C-285 begins in a **stressed but functioning** state. EVE has issued **critical escalation synthesis**; ZEUS is in **elevated verification**. The system is not asleep under pressure — it is **detecting strain and tightening review**.

**What matters most:** not silence — **signal quality**. Journals still flow, but the lane shows **duplication and template repetition**. Governance is alive; the journal lane needs **tighter compression** so critical meaning is not buried by repeated warnings.

**Interpretation**

- **EVE:** civic risk → operator attention (intended).
- **ZEUS:** promotion caution under stressed integrity (intended).
- **ATLAS:** oversight pulled in under GI pressure (intended).
- **Substrate:** still coherent enough to escalate, verify, and preserve continuity.

**Immediate priorities**

1. Tighten **promotion gates** until GI stabilizes.  
2. Require explicit **ATLAS review** on contested EPICONs.  
3. **Deduplicate or roll up** repeated ZEUS journal entries.  
4. In operator-facing copy, prefer **Vault-scoped secrets** (`VAULT_*_SECRET_TOKEN`) and name **`AGENT_SERVICE_TOKEN`** only where it is the **legacy shared** path (ledger / migration); do not present it as the canonical Vault witness secret.  
5. Preserve this cycle’s **escalation trail** for later sealing.

**Operator takeaway:** C-285 is a **pressure cycle**, not a collapse cycle. Disciplined verification, cleaner journal compression, and **no broad promotion without review**.

---

## CONFIRMED WORKING (carry-forward from prior cycles)

| Area | State | Notes |
|------|-------|--------|
| Terminal / snapshot | live | `GET /api/terminal/snapshot-lite` — cycle from pulse / ECHO / tripwire / calendar |
| Vault v2 | live | Seal council path; `GET /api/vault/status` exposes tranche vs Fountain semantics |
| KV / backup | optional | `REDIS_URL` + handbook CORS for public docs |

---

## ACTIVE ISSUES (C-285)

| Issue | Notes |
|-------|--------|
| GI band | ~0.75 — below comfort for broad promotion |
| Tripwire | elevated count — treat lane as hot |
| Journal duplication | compress / dedupe; preserve meaning density |
| Promotion | gate until GI stabilizes + explicit ATLAS on contested rows |

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

- **Ledger API:** `civic-protocol-core-ledger.onrender.com`

---

## Profession lens (C-285 bundle)

Multi-audience legibility matrix and phased PR bundle: [`docs/protocols/c-285-profession-lens-matrix.md`](docs/protocols/c-285-profession-lens-matrix.md). Pulse chamber implements Phase 1 slices (system story, why-this-matters, freshness language, provenance badges, VERIFY rollup).

---

## PR CHECKLIST REFERENCE

1. Read `AGENTS.md`, `BUILD.md`, and this file.  
2. If touching LOCKED behavior, justify in the PR body.  
3. Run `pnpm exec tsc --noEmit` and `pnpm build`.  
4. After deploy: `/api/terminal/snapshot` and `/api/vault/status` sanity.

---

*C-285 opens under pressure; the sentinels hold the line.*
