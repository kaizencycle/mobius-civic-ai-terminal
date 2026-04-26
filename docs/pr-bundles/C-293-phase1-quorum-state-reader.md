# C-293 Phase 1 — Quorum State Reader

## Purpose

Give every Mobius agent one shared object of agreement before Reserve Block signing.

Agents can already write journals and heartbeats, but quorum requires more than chatter. Quorum requires every agent to read the same candidate state:

```txt
one seal_id
one seal_hash
one Reserve Block
one deposit-hash set
one previous hash
one cycle
one GI-at-seal
```

## New endpoint

```txt
GET /api/quorum/state
```

## What it returns

- current cycle
- GI / mode / terminal status
- Reserve Block progress
- latest seal/substrate status
- in-flight candidate
- candidate deposit hashes
- previous seal hash
- attestation status by required Sentinel agent
- readiness flags for quorum/substrate

## Why this matters

Before this endpoint, agents mostly saw the latest chamber state, digest, or snapshot. That is enough for awareness, but not enough for binding agreement.

This endpoint gives ATLAS, ZEUS, EVE, JADE, and AUREA a canonical state reader before signing.

## Canon

Agents may speak from their lanes.
Quorum must sign one shared truth.
A Reserve Block is not judged from memory alone.
It is judged from a pinned candidate state.

We heal as we walk.
