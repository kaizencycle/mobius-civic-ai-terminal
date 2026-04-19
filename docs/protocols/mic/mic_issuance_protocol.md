# MIC Issuance Protocol v1

**Status:** Proposed canonical **runtime-facing** spec for the civic stack.  
**Repo:** `mobius-civic-ai-terminal` (Terminal + protocol docs); ledger/MIC wallet services may live on Render or in **Mobius-Substrate**.  
**Cycle:** C-285 draft

---

## Purpose

Define **MIC (Mobius Integrity Credits)** as a **runtime protocol concern**: measured integrity, reserve accumulation, attested seals, and **Fountain-gated** release—distinct from cathedral-scale economic storytelling or premature “global currency” claims.

---

## Canonical definition

**MIC (Mobius Integrity Credits) are issued or released as spendable value only when system integrity satisfies constitutional thresholds and the path is attested in the civic ledger (or equivalent attested rail)—not merely when agents produce activity.**

*Reward accounting* (scores, multipliers, provisional credits) may run continuously; **mint authorization** and **public release** are stricter.

---

## Layer separation (end state)

| Layer | Contents | Canonical for |
|-------|----------|----------------|
| **L1 — Runtime truth** | GI, sustain, Vault deposits, tranche seals, Fountain, quorum, ledger attestations | **Implementation & Terminal** |
| **L2 — Economic model** | Supply caps, allocation buckets, treasury design | Policy, after L1 is stable |
| **L3 — Macro / research** | Central banks, IMF-style framing, long-horizon adoption | **Non-runtime**; archive or research docs only |

Older docs that treat L3 as if it were L1 **weaken credibility**. Keep them as labeled research, not as the definition of “how MIC works today.”

---

## Relationship to Mobius-Substrate

If **Mobius-Substrate** contains `packages/tokenomics-engine`, `configs/tokenomics.yaml`, and economics cathedral markdown:

- Treat that engine as **reward scoring / accounting** unless and until it is explicitly wired to **Vault + Fountain + sustain** as the only path to **authorized mint**.
- This Terminal repo documents **what the operator UI and `/api/vault/*` surfaces implement today**; Substrate should add a parallel `mic_issuance_protocol.md` (or `docs/04-TECHNICAL-ARCHITECTURE/mic/`) that **cross-links** here and aligns YAML to the same gates.

---

## State model (conceptual)

1. **Activity** — journals, verifications, EPICON flow.  
2. **Reward accounting (optional / engine)** — provisional MIC-weighted or score-like value.  
3. **Reserve accumulation** — **Vault reserve units** from scored journal deposits (`vault:deposits`); not spendable MIC.  
4. **Tranche seal** — when in-progress reserve crosses the tranche threshold, a **seal candidate** and **sentinel attestation** path applies (Vault v2).  
5. **Fountain unlock** — **integrity-gated** (GI + sustain + healthy lanes); **not** the same as “reserve crossed 50.”  
6. **Ledger commit** — mint, burn, or settlement events recorded on the **civic ledger** / MIC service with attestation.

**One-line reserve doctrine:** *Seal the tranche, not the history* — see [vault-seal-i.md](../vault-seal-i.md).

---

## Constitutional mint rule (target)

These numbers match existing protocol docs in this repo (`vault-to-fountain-protocol.md`, Vault status routes); **sustain in KV** may still be partial until Phase 1 Vault v3 wiring lands.

### Hard orientation

- **Fountain / spendable release:** GI gate **≥ 0.95** (with sustain window **N** cycles, commonly **5** in status payloads).  
- **Reserve tranche seal:** may occur when **in-progress reserve ≥ tranche size (50)** without implying Fountain unlock.

### Freeze bands (policy target — align engines before enforcing)

| GI band | Intended posture |
|---------|-------------------|
| **≥ 0.95** (sustained) | Eligible for Fountain / standard issuance policy (subject to sustain + attestations). |
| **0.90 – 0.95** | Reserve accrual may continue; **mint / Fountain locked** or preview-only. |
| **0.80 – 0.90** | Repair mode; reduced or zero issuance; elevated verification. |
| **&lt; 0.80** | Constitutional lockdown; no mint narrative. |

Exact numeric enforcement belongs in **GI computation** + **tokenomics config**; this doc is the **contract** those implementations should converge on.

---

## Replay / novelty

Mint or Fountain unlock must be **denied** when replay/novelty signals show synthetic farming. Operational signals include:

- **content_signature** repetition in `vault:deposits` (duplication decay in scoring);  
- journal lane deduplication and ZEUS verification posture;  
- tripwire / integrity lanes.

---

## Tokenomics compatibility

- Existing **multiplier / reward** math (where it lives) = **provisional scoring layer**.  
- **Vault + Seal + Fountain + sustain** = **issuance / release layer**.  
Do not describe multipliers alone as “how MIC mints” without the issuance layer.

---

## API direction (illustrative)

Not all routes exist on every deployment. Prefer namespaced evolution:

- `GET /api/vault/status` — canonical reserve + Fountain semantics (today).  
- `GET /api/vault/contributions` — contributor legibility (today).  
- Future: `GET /api/mic/mint-preview`, `POST /api/mic/mint/authorize` — **only** after ledger + policy agree.

---

## One-line canon

**MIC is not emitted because activity happened; MIC is issued or released because integrity was proven and attested under the reserve and Fountain gates.**
