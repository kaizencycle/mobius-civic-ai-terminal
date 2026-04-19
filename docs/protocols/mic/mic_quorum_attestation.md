# MIC — Quorum & attestation

**Status:** Runtime reference for **this** codebase; mint ceremony details may extend on ledger/MIC services.

---

## Vault Seal council (live in Terminal)

Vault v2 **seal attestation** uses a fixed sentinel union (see `lib/vault-v2/types.ts`):

- **ATLAS, ZEUS, EVE, JADE, AUREA**

Per-agent secrets: `VAULT_*_SECRET_TOKEN` (legacy fallback: `AGENT_SERVICE_TOKEN`).  
Attestation route: `POST /api/vault/seal/attest`.  
Cron: `app/api/cron/vault-attestation/route.ts`.

This quorum is **for sealing reserve tranches**, not automatically for **MIC wallet mint**—but it is the **integrity witness pattern** MIC issuance should reuse or extend.

---

## Future: MIC mint authorization quorum (proposed)

A **separate** mint-authorization ceremony might require:

- **ZEUS** — verification / ledger consistency  
- **ATLAS** — strategic continuity  
- **JADE** — constitutional / civic-risk framing  
- **HERMES** — lane separation / narrative integrity  

Optional stabilizers (e.g. **EVE**, **AUREA**) — policy choice; must be written in spec before enforcement.

**Pass condition** must be defined in code + docs together (counts, timeouts, veto).

---

## Principle

**Quorum proves witness; GI + sustain proves system health; Fountain proves release.** None replaces the others.
