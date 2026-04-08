# Mobius Fork Model

## Purpose

This document defines how a **Mobius fork** should work.

A fork should allow a person, team, city, lab, or institution to run their own Mobius node, point agents at bounded data sources, keep memory local when needed, publish selected reasoning, and attest verified facts into shared rails without surrendering total data ownership.

Mobius should scale through **federation**, not forced centralization.

> **Doctrine:** Forks should share standards and attestations, not force total data surrender.

---

## Core Thesis

A Mobius fork is not just a UI clone. It is a bounded civic intelligence stack with four layers:

1. **Entry Surface** — Browser Shell or Terminal
2. **Reasoning Layer** — Agents, journals, and structured interpretation
3. **Fact Layer** — Attestations, EPICON events, Civic Ledger settlement
4. **Memory Layer** — Substrate state, cycle summaries, constitutional continuity

Every fork must separate:

- private raw input
- structured reasoning
- public attested facts
- shared protocol standards

---

## Flywheel Model

```text
sources
→ local agents
→ normalized signals
→ reasoning

reasoning
→ Substrate journals

verified public facts
→ Civic Ledger / EPICON

Shell / Terminal
← reads local + shared state
```

Short form:

- reasoning → Substrate
- fact → Ledger
- view → Terminal
- entry → Shell

---

## What a Fork Must Provide

A Mobius fork should bootstrap from a minimal set of inputs.

### Required inputs

- a fork of Shell, Terminal, or the full stack
- at least one signal source
- one or more configured agents
- one reasoning write destination
- one fact attestation destination
- one operator or citizen namespace

### Example starter profile

```json
{
  "fork_name": "mobius-health-watch",
  "entry_mode": "steward",
  "sources": ["who_api", "cdc_feed", "local_health_rss"],
  "agents": ["ATLAS", "ZEUS", "EVE"],
  "journal_write": "substrate",
  "ledger_write": "shared_civic_ledger",
  "mic_mode": "off",
  "visibility": "public_reasoning_private_raw"
}
```

---

## What Mobius Provides by Default

Every fork inherits the constitutional skeleton.

### Core roles

- **ATLAS** — watch / anomaly detection
- **ZEUS** — verification
- **EVE** — ethics / synthesis
- **HERMES** — routing
- **ECHO** — memory pulse / logging
- **AUREA** — strategy
- **JADE** — annotation / continuity
- **DAEDALUS** — build / research

### Core object types

- signal
- journal entry
- attestation
- ledger event
- tripwire
- integrity score
- mint evaluation

### Core rails

- **Shell** = citizen entry layer
- **Terminal** = operator read/interact layer
- **Substrate** = structured reasoning memory
- **Civic Ledger** = attested fact rail

### Core rules

- reasoning does not automatically become fact
- fact does not automatically become incentive
- private input does not automatically become public output
- every attested write needs provenance
- every fork may keep local memory scoped
- every shared write must satisfy protocol rules

---

## Fork Classes

### 1) Observer fork

Reads public data, produces little or no shared output.

Good for:

- public observers
- students
- read-only civic explorers

Writes:

- optional local journals only

### 2) Steward fork

Reads public data, emits structured reasoning.

Good for:

- NGOs
- policy groups
- civic research labs

Writes:

- Substrate journals
- occasional ledger attestations

### 3) Operator fork

Runs live signals, journals, attestations, terminal state.

Good for:

- institutions
- city teams
- civic operators
- domain monitoring organizations

Writes:

- Substrate
- Ledger
- optional MIC evaluations

### 4) Sovereign fork

Runs a private or semi-private full stack and chooses when to peer with shared rails.

Good for:

- cities
- enterprises
- governments
- serious local nodes

Writes:

- local everything by default
- selected shared attestations when desired

---

## What Stays Local

Mobius should not force total public disclosure.

Default-local data should stay local unless explicitly exported:

- raw API payloads
- temporary parsing artifacts
- private operator notes
- local identity details
- secrets, tokens, credentials
- internal prompts
- draft syntheses
- personal reflections
- partner-restricted data
- internal ranking heuristics

**Rule:** Raw data can stay local. Proofs and attestations can go public.

---

## What Goes to Substrate

Substrate is the structured memory layer for what a fork thinks and why.

Good Substrate writes:

- agent journals
- cycle summaries
- reasoning traces
- chamber notes
- operator decisions
- normalized signal summaries
- local governance state
- public documentation snapshots

Substrate should answer:

- What did we think?
- Why did we think it?
- What changed in our interpretation?
- What should the system remember?

Substrate should **not** become:

- a dump of every raw payload
- a private dossier warehouse
- a substitute for the ledger
- a container for secrets and credentials

---

## What Goes to the Civic Ledger

The ledger is the fact settlement layer: narrow, inspectable, public-facing.

Good ledger writes:

- attested public events
- verification outcomes
- threshold crossings
- governance resolutions
- service completions
- integrity-relevant settlements
- MIC-eligible proof events

Ledger should answer:

- What happened?
- Who attested it?
- Under what proof conditions?
- What integrity effect did it have?

Ledger should **not** hold:

- raw chain-of-thought
- private journals
- raw personal data
- every observation
- every scrape result
- every draft synthesis

**Rule:** The ledger is not memory-of-everything; it is public settlement for what matters.

---

## Shared Across Forks vs Local to Forks

### Shared across forks

- schemas
- agent role templates
- signal normalization formats
- attestation formats
- lane-health model
- integrity scoring framework
- terminal chamber grammar
- tripwire categories
- MIC policy templates

### Local to forks

- raw payloads
- private identities
- internal prompts
- private reflections
- restricted partner data
- local secrets
- experimental heuristics

**Rule:** The protocol is shared. The full data footprint is not.

---

## Entry Surfaces

### Browser Shell

Best for:

- citizens
- first-time users
- bounded civic actions

Primary uses:

- scoped identity
- attestation creation
- public participation flows

### Terminal

Best for:

- operators
- researchers
- maintainers
- infrastructure monitors

Primary uses:

- inspect state
- review signals
- verify outputs
- promote facts
- monitor lane health

### Full stack / Sovereign mode

Best for institutional or local-node deployments needing self-hosting, private memory, and selective peering.

---

## Bootstrapping Flow

1. **Connect sources** — point agents at bounded public or approved local sources.
2. **Normalize signals** — convert raw inputs into protocol-compatible signal objects.
3. **Write reasoning** — store interpretation in Substrate journals.
4. **Attest facts** — write verified public facts into the Civic Ledger.
5. **Read back state** — use Terminal and Shell to inspect what changed.

Flywheel summary:

user enters via Shell or Terminal
→ connects sources
→ agents observe + reason
→ reasoning writes to Substrate
→ facts attest to Ledger
→ Terminal reads state back
→ operator/citizen sees consequence

---

## Public / Private Boundary Matrix

### Private

- raw data
- private reflections
- secrets
- credentials
- local user details
- internal prompts
- draft notes

### Shared but structured

- journal summaries
- cycle notes
- normalized public signals
- operator reasoning intended for public memory

### Shared and attested

- ledger events
- governance outcomes
- verified incidents
- integrity settlements
- mint-eligible proofs

This keeps Mobius from becoming either a black box or a surveillance vacuum.

---

## MIC Across Forks

Fork-level MIC modes should be selectable:

- MIC off
- MIC local only
- MIC shared-ledger eligible

MIC should mint only from:

- verified service
- verified contribution
- verified governance action
- verified integrity-preserving work

MIC should not mint from:

- vague activity
- passive surveillance
- hidden loyalty scoring
- raw personal behavior tracking

**Rule:** MIC mints from attested integrity, not exposed personal life.

---

## Identity Model for Forks

Mobius should avoid one universal, permanently exposed citizen profile.

Preferred pattern:

- scoped credentials
- bounded role claims
- session-based authorization
- selective disclosure
- pseudonymous public identity where appropriate

Example:

A user should be able to prove “I am authorized to support this proposal” without disclosing full identity, full action history, or all prior participation.

**Rule:** A participant should attest an action, not surrender a dossier.

---

## Write Policy

### Reasoning writes

Go to:

- Substrate journals
- local structured memory
- cycle summaries

### Fact writes

Go to:

- Civic Ledger
- EPICON rail
- public attestation stream

### Private notes

Stay in:

- local vaults
- private journals
- local notes apps
- internal ops spaces

Key split:

private meaning ≠ system reasoning ≠ public attested fact

---

## Governance Doctrine

Required principles:

- transparency of systems, not transparency of citizens
- bounded claims, not overbroad certainty
- provenance before promotion
- integrity before amplification
- federated writes with constitutional read paths
- optional sovereignty without protocol breakage

Anti-feudal doctrine:

A fork should be able to run independently, keep memory private, publish selected proofs, verify shared truth, and avoid forced dependency on any single central actor.

One-line version:

**Mobius federation should coordinate without requiring total capture.**

---

## Minimal Starter Bundle

Required files:

- `mobius.config.json`
- `sources.json`
- `agents.json`
- `journal-policy.json`
- `ledger-policy.json`
- `integrity-policy.json`

Suggested profile presets:

- observer
- steward
- operator
- sovereign

---

## Acceptance Criteria for a Valid Fork

A Mobius fork is valid if it can:

1. connect to at least one source
2. run at least one agent role
3. preserve reasoning in structured memory
4. attest at least one public fact
5. keep local/private data scoped
6. expose provenance for shared outputs
7. read back resulting state through Terminal or Shell
8. remain compatible with shared protocol objects

---

## Canon Summary

A Mobius fork is a bounded civic intelligence node that:

- reads local or public sources
- reasons through agents
- writes structured memory to Substrate
- attests verified facts to the Civic Ledger
- lets users inspect resulting state through Shell and Terminal
- preserves sovereignty by sharing standards and attestations instead of demanding total raw data surrender

### Canon lines

- Forks should share standards and attestations, not force total data surrender.
- Reasoning belongs in Substrate. Facts belong in the Ledger. The view belongs in the Terminal. Entry belongs in the Shell.
- A Mobius fork should coordinate with the commons without being swallowed by it.
