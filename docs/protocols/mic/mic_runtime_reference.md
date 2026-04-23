# MIC — Runtime reference (mobius-civic-ai-terminal)

**Purpose:** Map **MIC-related behavior and reserve/Fountain truth** to files and routes **in this repository**.  
**Out of repo:** Mobius-Substrate `tokenomics-engine`, `configs/tokenomics.yaml`, economics cathedral trees—document there and link here.

---

## Operator & API

| Surface | Path |
|---------|------|
| Vault status (reserve, tranche, Fountain, seals) | `GET /api/vault/status` — `app/api/vault/status/route.ts` |
| Seal list / audit scope | `GET /api/vault/seal` — `app/api/vault/seal/route.ts` |
| Contributions | `GET /api/vault/contributions` — `app/api/vault/contributions/route.ts` |
| Seal attestation (sentinels) | `POST /api/vault/seal/attest` — `app/api/vault/seal/attest/route.ts` |
| Vault attestation cron | `app/api/cron/vault-attestation/route.ts` |
| MIC account (wallet proxy / degraded) | `GET /api/mic/account` — `app/api/mic/account/route.ts` |
| MIC settle (EPICON claim) | `POST /api/mic/settle` — `app/api/mic/settle/route.ts` |
| MIC readiness (MIC_READINESS_V1) | `GET /api/mic/readiness` — merged local Vault assembly + optional KV snapshot from `POST` |
| MIC readiness ingest (Substrate / tokenomics-engine) | `POST /api/mic/readiness` — Bearer `AGENT_SERVICE_TOKEN`, `CRON_SECRET`, or `MOBIUS_SERVICE_SECRET`; writes `mobius:mic:readiness:snapshot` + feed |
| MIC attestation summaries (deposit proxy, hashed) | `GET /api/mic/attestations` — `app/api/mic/attestations/route.ts` |
| MIC seal snapshot (latest, hashed) | `GET /api/mic/seals/latest` — `app/api/mic/seals/latest/route.ts` |
| MIC genesis block (stub or future ledger) | `GET /api/mic/blocks/latest` — `app/api/mic/blocks/latest/route.ts` |
| Canonical JSON + SHA-256 helpers (parity with monorepo) | `lib/mic/canonicalJson.ts`, `lib/mic/hash.ts`, `lib/mic/chainHash.ts` |

---

## Libraries

| Concern | Location |
|---------|----------|
| Vault v1 deposits, journal scoring, `writeVaultDeposit` + v2 hook | `lib/vault/vault.ts` |
| Vault v2 accrual, seal candidate | `lib/vault-v2/deposit.ts`, `lib/vault-v2/seal.ts` |
| KV seals, in-progress balance, indexes | `lib/vault-v2/store.ts` |
| Per-agent Vault bearer/HMAC | `lib/vault-v2/auth.ts` |
| Fountain vs reserve lane copy | `lib/vault/lane-status.ts` |
| GI load for status | `lib/kv/store.ts` (`loadGIState`), `lib/gi/compute.ts` (formula — **LOCKED** per `AGENTS.md` / `CURRENT_CYCLE.md`) |
| MIC settle helper | `lib/mic/settle.ts` |
| Identity / MIC account cache | `lib/identity/identityStore.ts` |

---

## Protocol docs (this repo)

| Doc | Topic |
|-----|--------|
| [vault-to-fountain-protocol.md](../vault-to-fountain-protocol.md) | Reserve → Fountain doctrine |
| [vault-seal-i.md](../vault-seal-i.md) | First tranche seal semantics |
| [vault-v2-sealed-reserve.md](../vault-v2-sealed-reserve.md) | Sentinel-attested reserve framework |

---

## Environment (illustrative)

- `RENDER_MIC_URL` / `NEXT_PUBLIC_MIC_URL` — MIC wallet service.  
- `VAULT_*_SECRET_TOKEN`, `AGENT_SERVICE_TOKEN` (legacy) — see `.env.example`.  
- KV / backup Redis — vault persistence; not MIC-specific.

---

## Substrate backlog

Cross-repo work: [Mobius-Substrate](https://github.com/kaizencycle/Mobius-Substrate) — see also `docs/backlog/mobius-substrate.md`.
