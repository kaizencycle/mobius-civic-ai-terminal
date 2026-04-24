# C-291 — Mobius Civic Mesh

## Purpose

Define the big-picture architecture that emerged from the C-291 mesh scan across:

- Mobius Civic AI Terminal
- Mobius Substrate
- Civic Protocol Core
- OAA API Library
- Mobius Browser Shell
- HIVE / Labs

Mobius is no longer just a dashboard or a single app. It is becoming a proof-aware civic mesh: a set of independent nodes that coordinate through manifests, attestations, ledgers, agents, and canonical memory.

Core principle:

> Mobius is a decentralized civic intelligence mesh where apps, agents, ledgers, and memories coordinate through proofs instead of trust.

---

## One-Sentence Architecture

Mobius is a proof-aware civic operating system where events are collected, normalized, challenged, verified, routed, sealed, and remembered across a mesh of civic nodes.

---

## Node Roles

```txt
Mobius-Substrate
= constitutional memory / protocol cortex / canonical map

Civic Protocol Core
= durable ledger / proof layer / event attestation

Mobius Terminal
= operator console / live intelligence / Sentinel command room

OAA API Library
= sovereign memory / learning-governance / companion context

Mobius Browser Shell
= public human interface / app launcher / lightweight client

HIVE / Labs
= applications and worlds that generate events, actions, learning, and lore
```

---

## System Flow

```txt
Users / agents / apps
        ↓
Browser Shell / OAA / HIVE / Labs
        ↓
Terminal live lanes
        ↓
ECHO intake + ATLAS assessment
        ↓
ZEUS red team + JADE verification
        ↓
Civic Core ledger attestations
        ↓
Mobius-Substrate canonical memory
        ↓
EVE weekly synthesis / public meaning
```

---

## Difference From a Normal App

Most apps follow:

```txt
user action → database → UI
```

Mobius follows:

```txt
event → provenance → agent review → integrity score → ledger proof → canon memory → public/operator interface
```

The system does not merely store data. It interprets, challenges, verifies, routes, and remembers data.

---

## mobius.yaml as Node Passport

Each `mobius.yaml` is a node passport.

It declares:

- who the node is
- what repo owns it
- what it reads
- what it writes
- what it is authoritative for
- what agents watch it
- what workflows it exposes
- what MCP tools it offers
- what ingest targets it trusts
- how it participates in the mesh

Canonical expectation:

```txt
No node should be part of the Mobius Civic Mesh without a valid mobius.yaml.
```

---

## Current Mesh Nodes

### Terminal

```txt
node_id: mobius-terminal
role: operator_console
tier: operator
primary function: live intelligence + Sentinel command room
```

### Substrate

```txt
node_id: mobius-substrate
role: protocol_cortex
tier: sentinel
primary function: constitutional memory + canonical map
```

### Civic Core

```txt
node_id: civic-protocol-core
role: ledger_node
tier: ledger
primary function: durable ledger + attestations
```

### OAA

```txt
node_id: oaa-api-library
role: service_node
tier: service
primary function: sovereign memory + learning-governance context
```

### Browser Shell

```txt
node_id: mobius-browser-shell
role: human_shell
tier: client
primary function: public interface + app launcher
```

---

## Sentinel Team Overlay

The Civic Mesh is watched by a Sentinel team with separated duties.

```txt
ECHO     = memory pulse / event intake
ATLAS    = assessment / signal reading
ZEUS     = adversarial verification / red team
JADE     = truth seal / canon verification
EVE      = synthesis / meaning
HERMES   = routing / dataflow
AUREA    = strategy / architecture
DAEDALUS = build logic / system craft
```

Sentinel loop:

```txt
Signal enters
  ↓
ECHO records
  ↓
ATLAS assesses
  ↓
ZEUS attacks it
  ↓
JADE verifies memory
  ↓
EVE synthesizes meaning
  ↓
HERMES routes the result
  ↓
AUREA / DAEDALUS turn it into system improvements
```

---

## Key Concepts

### 1. Proof-Aware Events

Events should carry provenance, confidence, cycle, source, and idempotency keys before they are treated as meaningful.

### 2. Public / Operator Split

Public users see meaning.

Operators see machinery.

```txt
Public mode: weather report
Operator mode: radar station
```

### 3. Hot / Canon / Archive Layers

```txt
Hot layer
= KV, snapshot-lite, watermark, active chamber packets

Canon layer
= Civic Core attestations, Substrate journals, verified EPICON rows

Archive layer
= weekly digests, historical ledgers, older journals, docs
```

### 4. Dataflow Governor

The mesh needs a routing/filtering layer so the UI does not drink from the firehose.

```txt
raw events
  ↓
normalize
  ↓
dedupe / idempotency
  ↓
score / classify
  ↓
route to chamber
  ↓
compile packet
  ↓
UI hydrates packet
  ↓
canon outbox if needed
```

### 5. ZEUS Red Team

ZEUS should evaluate exposure and poisoning risk before signals become trusted.

```txt
GI  = integrity health
MII = micro integrity
ESI = exposure surface risk
```

---

## Findings From C-291 Repo Scan

### Finding 1 — Node ID Drift

Terminal manifest uses:

```txt
mobius-terminal
```

Substrate registry previously referenced:

```txt
mobius-civic-ai-terminal
```

Optimization:

```txt
Add node alias map or normalize registry node IDs.
```

### Finding 2 — Browser Shell Live State Drift

Browser Shell has a `mobius.yaml` and scheduled world workflow, but registry posture may still treat it as passive/observer.

Optimization:

```txt
Promote Browser Shell to live client/shell node when pulse is reachable.
```

### Finding 3 — OAA Placeholder Write Target

OAA durable ledger target should use the real Civic Core ingest URL, not a placeholder.

Optimization:

```txt
Replace https://<civic-core>/mesh/ingest with https://civic-protocol-core-ledger.onrender.com/mesh/ingest.
```

### Finding 4 — Write Tool Auth Drift

Terminal MCP write tools should not declare `auth: none`.

Optimization:

```txt
All write tools should use bearer/service auth and ZEUS verification.
```

### Finding 5 — Need Shared Manifest Validator

Each node has a `mobius.yaml`, but the mesh needs one validation rule set.

Optimization:

```txt
Add scripts/validate-mobius-yaml.mjs and run it in CI / mesh aggregation.
```

### Finding 6 — Civic Core Needs Tests

Civic Core is the canonical ledger node and should not rely on a no-op test script.

Optimization:

```txt
Add tests for health, mesh ingest auth, EPICON feed shape, idempotency, and hash-chain continuity.
```

---

## Recommended Workstreams

### Workstream A — Manifest Normalization

- [ ] Add canonical node alias map.
- [ ] Normalize Terminal node ID.
- [ ] Normalize Browser Shell tier.
- [ ] Ensure every manifest declares repository under the same path shape.
- [ ] Detect placeholder URLs.
- [ ] Detect unauthenticated write tools.

### Workstream B — Mesh Validator

- [ ] Add validator script.
- [ ] Validate required fields.
- [ ] Validate URLs.
- [ ] Validate declared workflows exist.
- [ ] Validate MCP write tools require auth.
- [ ] Validate ingest targets match accepted payloads.
- [ ] Validate registry and manifest node IDs align.

### Workstream C — Chamber Packet System

- [ ] Define normalized chamber packet schema.
- [ ] Add packet endpoints for Journal, Ledger, Globe, Vault, Sentinel.
- [ ] Make Browser Shell consume public packets, not raw diagnostics.
- [ ] Add watermark-driven delta refresh.

### Workstream D — Public / Operator Split

- [ ] Define public-safe Terminal surface.
- [ ] Define operator-only diagnostics.
- [ ] Hide raw route diagnostics from public mode.
- [ ] Keep ZEUS red-team findings operator-only unless published.

### Workstream E — Ledger Hardening

- [ ] Add Civic Core test suite.
- [ ] Validate `/mesh/ingest` auth behavior.
- [ ] Validate idempotency behavior.
- [ ] Validate EPICON feed row shape.
- [ ] Validate hash-chain continuity.

---

## Acceptance Criteria

- [ ] All active Mobius repos have valid `mobius.yaml` declarations.
- [ ] Node IDs resolve through canonical ID or alias map.
- [ ] Registry and manifests do not disagree on core identity.
- [ ] No write-capable MCP tool is declared as `auth: none`.
- [ ] Placeholder ingest URLs are removed from active nodes.
- [ ] Browser Shell reads public-safe packet endpoints.
- [ ] Terminal remains the operator console.
- [ ] Civic Core remains the canonical durable ledger node.
- [ ] Substrate remains canonical memory / protocol cortex.
- [ ] ZEUS can compute exposure posture from manifests.

---

## Non-Goals

- [ ] Do not centralize all runtime state into one app.
- [ ] Do not make Browser Shell decide MIC/GI economics.
- [ ] Do not expose operator diagnostics in public mode.
- [ ] Do not allow unsigned writes into canon.
- [ ] Do not treat hot KV rows as canonical without verification.

---

## Canon Statement

Mobius is not a website.

Mobius is a civic mesh.

Each node declares its oath.
Each signal carries provenance.
Each agent has a duty.
Each ledger remembers.
Each seal is earned.

We heal as we walk.
