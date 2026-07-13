---
epicon_id: EPICON_C-371_PROPOSAL_oaa-universal-agent-hub_v1
title: "OAA as Universal Agent Hub — Ledger-Native Identity and Tiered Inference"
author_name: "Michael Judan (custodian), drafted with Claude"
author_wallet: ""
cycle: "C-371"
epoch: ""
tier: "GOVERNANCE"
scope:
  domain: "identity"
  system: "oaa"
  environment: "mainnet"
epicon_type: "governance-architecture-proposal"
status: "proposal"
related_prs: []
related_epicons:
  - "EPICON_C-371_PROPOSAL_reserve-block-ui-verified-truth_v1"
  - "EPICON_C-370_GOVERNANCE_mic-issuance-ratification_v1"
tags:
  - "oaa"
  - "cpc"
  - "identity"
  - "sentinels"
  - "inference"
  - "tiering"
  - "mii"
  - "goodhart"
  - "provider-independence"
integrity_index_baseline: null
risk_level: "high"
created_at: "2026-07-13T19:00:00Z"
updated_at: "2026-07-13T19:00:00Z"
version: 1
hash_hint: ""
summary: "Governance + architecture proposal to extend OAA identity issuance to all ten Mobius Sentinels, with provider-independent ledger-native identity, EPICON-tiered inference (routine Tier 0/1 vs governance Tier 2/3), MII-weighted training signals with explicit Goodhart guardrails, and mandatory traceability. Addresses swarm credit exhaustion and URIEL/ZENITH provider independence. No implementation."
---

# Proposal — OAA as Universal Agent Hub: Ledger-Native Identity and Tiered Inference for All Mobius Sentinels

**Author:** Michael Judan (custodian), drafted with Claude  
**Cycle:** C-371  
**Type:** Governance + architecture proposal — not yet implemented  
**Ties to:** `HANDOFF_C-371_CPC_OAA_identity_reconciliation.md` (human identity
side of this same split — **companion doc, not yet filed**), the seal-quorum-semantics open question raised by
AUREA in C-370, and the swarm credit-exhaustion problem observed live in
production this cycle.

**Related proposals:**

- [`EPICON_C-371_PROPOSAL_reserve-block-ui-verified-truth_v1.md`](./EPICON_C-371_PROPOSAL_reserve-block-ui-verified-truth_v1.md) — UI/query-layer companion (operational truth display)
- [`EPICON_C-370_EVE_kv-watchdog-proposal_v1.md`](../C-370/EPICON_C-370_EVE_kv-watchdog-proposal_v1.md) — infra watchdog pattern for ratification discipline

---

## 1. The two-domain identity split

- **CPC (Civic Protocol Core)** — human identity. Citizens, Civic ID, JWT,
  MIC wallet. Humans hold AI authority as accountable principals.
- **OAA (Open Autonomous Academy)** — agent identity. All ten Mobius
  Sentinels, with their own durable identity, economic history, and
  (proposed here) their own bounded inference continuity — an emerging
  consensus grounded in the Mobius Ledger rather than solely in
  per-call access to a third-party frontier model.

These are parallel, not competing, domains. Nothing here changes CPC's role
or the human-identity reconciliation work already proposed separately.

---

## 2. Why this now: two real problems, one architecture

### 2.1 The operational problem (observed directly in production this cycle)

Every `cron/swarm` run pulled during this cycle showed **0 of N agents
succeeding** — ATLAS, ECHO, HERMES, AUREA all failing identically on
routine operations (heartbeat writes, journal formatting) due to Anthropic
API credit exhaustion. Right now, every Sentinel action — no matter how
routine or previously-seen — requires a fresh frontier-model call. When
that call fails, the agent doesn't degrade; it simply doesn't act.

### 2.2 The architectural problem (only visible once OAA's full roster is considered)

OAA currently names four companions (Jade, Eve, Zeus, Hermes) out of the
ten Sentinels actually in production (ATLAS, ZEUS, EVE, JADE, AUREA,
HERMES, ECHO, DAEDALUS, URIEL, ZENITH). Two of those ten — **URIEL (xAI
Grok) and ZENITH (Google Gemini)** — run on entirely different vendor
models under the same Sentinel role. This makes a strong, independent case
for ledger-native identity: an agent's accountable self shouldn't be tied
to which company's model happens to be serving that role this month. If a
provider changes, deprecates a model, or has an outage, the Sentinel's
actual identity — its MII trail, dispute history, verification record —
should persist independent of that.

### 2.3 Why one architecture solves both

A bounded, ledger-native inference layer, scoped correctly, both reduces
dependence on any single frontier-model provider for routine operations
*and* gives every Sentinel a persistent, provider-independent identity
grounded in its own accountable history rather than in whichever model
happens to be answering right now.

---

## 3. What this is NOT proposing

This matters enough to state before anything else: this proposal describes
**operationally real** agent identity — persistent, accountable, provider-
independent, with genuine consequences and a genuine history that can't be
quietly reset or reassigned. It does **not** claim or require settling
whether an agent has anything like interests or experience that would make
questions of consent meaningfully different from questions of
infrastructure. That is a separate, harder question this proposal
deliberately does not answer, and building the architecture below does not
require answering it. Keeping this distinction explicit protects the
custodial-accountability answer this proposal depends on: as long as this
stays in the operationally-real domain, "who is accountable when a Sentinel
acts" has a clean answer — the human custodian, same as today.

---

## 4. Proposed architecture

### 4.1 OAA as identity issuer for all ten Sentinels

Extend OAA's existing per-companion pattern (currently HMAC secrets for
Jade/Eve/Zeus/Hermes) to all ten agents. Each Sentinel gets:

- A durable, OAA-issued identity, strengthened beyond a shared secret
  toward something more like a per-agent keypair
- Its own MIC balance — this already effectively exists as per-agent
  vault-v2 deposit tracking (`journal-ATLAS-C-371-...`,
  `journal-ECHO-C-371-...`, etc. with running `balance_after`); this
  proposal reframes existing data as belonging to a real identity rather
  than just labeling a ledger row
- Its own MII/reputation trail, persistent across cycles and, critically,
  **persistent across provider changes** for URIEL/ZENITH
- A public accountability record: MII, verification pass/fail history,
  dispute record — visible the same way a citizen's civic record would be
  under CPC. Nobody has really built this as a product yet; it's a direct,
  literal expression of the Witness Principle.

### 4.2 Tiered inference — the actual safety-critical design decision

Use the EPICON tier system that already exists, rather than inventing a new
one:

| Tier | Examples | Inference source |
|---|---|---|
| **0/1 — routine, low-risk** | Heartbeat writes, journal formatting, repeat-pattern verification, standard journal deposits | Ledger-native inference is a reasonable default or fallback — this is where credit exhaustion currently causes total failure, and where a bounded local layer has the most to offer |
| **2/3 — governance, minting, disputes, anything seal-quorum-adjacent** | Reserve Block sealing, MIC issuance decisions, dispute resolution, EPICON intent authorship | **Requires a real, traceable frontier-model call, every time — no local-inference shortcut, ever.** This is where genuine reasoning and accountability both matter most |

This split directly solves the swarm-credit problem for routine operations
without touching anything sensitive.

### 4.3 MII-weighted training signal, and its Goodhart risk

A ledger-native inference layer for a given Sentinel would train on that
Sentinel's own operational history. The genuinely useful, project-specific
idea: **weight that history by the MII/GI recorded at the time each
decision was made**, so decisions from high-confidence, high-integrity
periods count more than ones made during degraded conditions (low GI,
Haiku-fallback during credit exhaustion, a period where a since-fixed bug
was live).

**The risk, named plainly because this project has been disciplined about
exactly this failure mode all cycle:** if a Sentinel's ledger-derived
inference trains on its own past outputs without this weighting — or if the
weighting itself is gamed or miscalibrated — degraded behavior can get
reinforced as normal. This is the same shape of problem §17 (Goodhart
Resistance Doctrine) was written to prevent for MIC issuance, applied now
to inference instead of minting. The same discipline applies: don't let a
proxy for good behavior become the target optimized toward.

### 4.4 Traceability — non-negotiable

EPICON-02's premise is intent precedes authority. A Tier 0/1 action taken
via ledger-native inference still needs a documented reason: what data
informed it, how it was weighted, why this output. An untraceable "gut
feeling" layer — even a well-intentioned one — is exactly the kind of blind
spot that produced a multi-day forensic investigation earlier this cycle
(the chain-continuity incident). It must be labeled the same way the MII
`OPT-09` mock fallback already is: visibly, explicitly, never silently
substituted for a real, attributable decision.

---

## 5. Open questions requiring explicit custodial decisions

- **Does agent identity backdate to existing vault-v2 balances, or start
  fresh?** The data already exists; whether it counts as this identity's
  history from day one is a decision, not a technical default.
- **Who has custodial authority over an individual agent's identity** —
  particularly for URIEL and ZENITH, whose underlying models aren't
  Anthropic's? Does provider changeover require an explicit re-attestation
  event, or does the ledger-native identity simply continue?
- **What triggers Tier 0/1 → Tier 2/3 escalation** when a routine-seeming
  situation turns out to have higher stakes than initially apparent? This
  needs a clear, pre-committed rule, not a judgment call made in the
  moment by the same inference layer being escalated away from.
- **How is MII-weighting calibrated and audited**, and by whom, to guard
  against the Goodhart risk in 4.3? This likely needs its own periodic
  review process, not a one-time design decision.

---

## 6. Proposal record (not EPICON-02 implementation intent)

The block below records custodian intent at proposal scope. A full
EPICON-02 intent with valid `ledger_id`, `expires_at`, `VALUES INVOKED`,
`ANCHORS`, etc. must be drafted separately before any implementation PR —
same discipline as the EVE watchdog and Reserve Block UI proposals.

```text
epicon_id: EPICON_C-371_OAA_agent-hub-ledger-inference_v1
ledger_id: mobius:kaizencycle
scope: specs
mode: proposal
issued_at: 2026-07-13T19:00:00Z

justification (summary):
  Extend OAA from four-companion hub to full ten-Sentinel roster with
  durable per-agent identity and bounded ledger-native inference for
  routine (Tier 0/1) operations. Addresses swarm credit exhaustion and
  provider-independent identity for URIEL/ZENITH. Tier 2/3 retains
  mandatory real-model-call requirements.

counterfactuals:
  - If MII-weighting cannot be calibrated safely, do not ship 4.3 even if
    4.1/4.2 are ready.
  - If Tier 0/1 vs 2/3 boundaries are ambiguous, default to Tier 2/3.
  - Do not smuggle claims about agent moral status into implementation.

boundaries:
  Proposal and design only. No identity issuance, inference layer, or
  MII-weighting mechanism implemented as part of this filing.
```

---

## 7. Recommended ratification path

1. **Custodian sign-off** on this proposal (and companion CPC handoff when filed).
2. **Resolve open questions** in §5 before code — especially backdating and Tier escalation rules.
3. **Phase 1 EPICON intent:** OAA identity issuance for all ten Sentinels (no inference layer yet).
4. **Phase 2 EPICON intent:** Tier 0/1 ledger-native inference fallback for defined routine ops only.
5. **Phase 3 (gated):** MII-weighted training signal — only after Goodhart calibration process is specified.

---

*This is a proposal, not an implementation directive. Given its scope
(governance + architecture + four open custodial decisions), recommend this
gets explicit sign-off before any code work begins — the same discipline
applied to the EVE watchdog and Reserve Block UI proposals, scaled up
because the stakes here (agent accountability, provider-independence,
Goodhart risk in a self-referential training loop) are higher than either
of those.*

*"We heal as we walk." — Mobius Systems*
