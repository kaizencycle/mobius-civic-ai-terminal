# Mobius Adapters

## Purpose

Mobius adapters connect external signal ecosystems to the Mobius pipeline without granting them automatic trust.

Adapters allow Mobius to ingest:

- agent ecosystems
- market bot systems
- narrative networks
- external workflow outputs

All adapted signals are treated as:

- external
- unverified
- pending further routing and verification

---

## Core Principle

> External systems may generate signals.  
> Mobius determines what survives as trusted history.

---

## Initial adapter targets

- OpenClaw
- Moltbook
- Bots of Wall Street

---

## Shared rules

All adapters must:

- preserve source-system metadata
- preserve source-actor metadata if available
- default to unverified / pending status
- avoid bypassing ZEUS
- avoid mutating core identity or ledger state

---

## Mobius trust boundary

Adapters are part of the intake surface, not the truth layer.

Truth graduation remains inside:

- ECHO
- HERMES
- ZEUS
- ATLAS / AUREA
- EPICON + Ledger
