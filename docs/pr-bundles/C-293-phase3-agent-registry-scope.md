# C-293 Phase 3 — Agent Registry + Scope Cards

## Purpose

Give every Mobius agent a canonical identity and operating boundary.

Phase 1 gave agents a shared quorum state reader.
Phase 2 gave protocol objects explicit lifecycle states.
Phase 3 gives agents explicit scope.

## New module

```txt
lib/agents/registry.ts
```

Each agent now has a Scope Card defining:

- registry ID
- role
- tier
- authority
- allowed reads
- allowed writes
- allowed decisions
- forbidden actions
- outputs
- automation hints
- planned public key env for Phase 4 signature work

## New endpoints

```txt
GET /api/agents/registry
GET /api/agents/registry?agent=ZEUS
GET /api/agents/registry?compact=true
GET /api/automations/registry
```

## Why this matters

Without scopes, agents are just automations and prompts. They may overlap or drift into each other's authority.

With scopes:

- ECHO brings signal
- ATLAS checks structure
- ZEUS verifies and may veto
- EVE escalates civic risk
- JADE frames canon
- AUREA synthesizes strategy
- HERMES routes
- DAEDALUS diagnoses infrastructure

## Phase 4 handoff

This PR does not enforce cryptographic signatures yet.

It prepares the contract for Phase 4:

```txt
agent registry_id
+ public_key_env
+ signs[]
+ signed output
```

## Canon

Agents without scope are workers.
Agents with scope are institutions.

Every Mobius agent must know:

1. What it may read
2. What it may write
3. What it may decide
4. What it must never decide
5. What authority it holds
6. What it will sign in Phase 4

We heal as we walk.
