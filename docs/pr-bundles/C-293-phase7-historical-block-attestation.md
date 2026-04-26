# C-293 Phase 7 — Historical Reserve Block Back-Attestation

## Purpose

Allow Sentinel agents to back-attest completed Reserve Blocks whose proof records already exist but were finalized before the current quorum/signature loop was fully active.

This phase does **not** rewrite history. It lets agents review stored proof and sign a historical attestation over the exact stored Reserve Block payload.

## New module

```txt
lib/vault-v2/historical-attestation.ts
```

## New endpoints

```txt
GET  /api/vault/blocks/historical
GET  /api/vault/blocks/historical?seal_id=<seal_id>
POST /api/vault/blocks/historical/attest
```

## What agents sign

Historical agents sign this canonical payload:

```json
{
  "version": "C-293.phase7.v1",
  "action": "historical_quorum_attestation",
  "seal_id": "...",
  "seal_hash": "...",
  "sequence": 1,
  "cycle_at_seal": "C-293",
  "reserve": 50,
  "gi_at_seal": 0.67,
  "mode_at_seal": "red",
  "source_entries": 123,
  "deposit_hashes": ["..."],
  "prev_seal_hash": null,
  "historical": true,
  "review_basis": "stored_seal_record"
}
```

## Back-attestation flow

```txt
completed Reserve Block
→ GET /api/vault/blocks/historical?seal_id=...
→ agent signs historical_quorum_attestation payload
→ POST /api/vault/blocks/historical/attest
→ signature verifies
→ dedupe key is consumed
→ attestation is attached to the existing Seal record
```

## Safety rules

Historical attestation:

- validates stored proof
- cannot rewrite original seal_hash
- cannot invent deposit_hashes
- cannot pretend the attestation was live
- cannot unlock Fountain by itself
- must pass the Phase 4 signature + dedupe layer

## Scope update

Sentinel agents now include `historical_quorum_attestation` in their signature action list:

```txt
ATLAS
ZEUS
EVE
JADE
AUREA
```

## Canon

Historical attestation validates stored proof.
It does not rewrite history.
It does not pretend agents signed live at the time.
It does not unlock the Fountain by itself.

We heal as we walk.
