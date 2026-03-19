# Mobius Agent Adapter System v0.1

## Purpose

Allow external agent ecosystems to plug into Mobius as signal sources without inheriting trust automatically.

---

## Core Principle

> External agents may generate signals.  
> Only Mobius may graduate signals into trusted history.

---

## Flow

```text
External Agent System
(OpenClaw / Moltbook / Bots of Wall Street / future sources)
        ↓
Adapter
(normalize + label source)
        ↓
ECHO
(intake)
        ↓
HERMES
(route + categorize)
        ↓
EPICON
(structured event)
        ↓
ZEUS
(verify + score)
        ↓
ATLAS / AUREA
(reason + synthesize)
        ↓
Terminal + Ledger
```

---

## Rules

1. All external signals are unverified by default.
2. External systems cannot directly publish verified EPICONs.
3. Every adapted signal must include source system metadata.
4. ZEUS controls confidence upgrades.
5. Source systems receive reliability scores over time.

---

## Initial Adapter Targets

- OpenClaw
- Moltbook
- Bots of Wall Street

---

## Trust Boundary

Adapters are part of the intake surface, not the truth layer.

External systems must not be able to:
- bypass ZEUS
- mutate MII
- overwrite ledger continuity
- silently inherit trust

---

## External Signal Contract

External signals should be normalized into a shared structure before entering EPICON evaluation.

Required concepts:
- source system
- source actor if available
- observation timestamp
- category
- title
- summary
- raw payload
- optional source URL
- optional tags

---

## Normalized EPICON Candidate Contract

A normalized candidate must:
- remain pending
- start at low confidence
- identify ECHO as owner agent
- preserve source system traceability
- include routing / verification trace

---

## Compatibility Rule

Fork the interface. Share the ledger.

Mobius-compatible terminals and adapters may customize experience and workflows, but must preserve:
- identity continuity
- EPICON compatibility
- ZEUS verification boundaries
- cycle continuity
- replayable historical trace

---

## Source Reliability

Mobius should score external ecosystems over time.

Source reliability is intended to answer:
- does this ecosystem produce useful signals?
- does it drift?
- does it overproduce noise?
- how often do its claims verify?

This score does not replace ZEUS.
It informs intake and routing.

---

## Guardrails

- read-only ingestion by default
- no direct privileged execution
- no silent schema mutation
- no bypass of Mobius identity, EPICON, or verification layers

---

## One-Line Intent

Mobius observes agent ecosystems without being absorbed by their noise.
