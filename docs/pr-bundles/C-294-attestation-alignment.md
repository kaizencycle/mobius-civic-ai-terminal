# C-294 — Vault ↔ Canon Attestation Alignment

## Problem Observed
- Vault shows `attested_blocks = 0`
- Canon / Substrate shows `complete_attested_blocks = 4`

## Root Cause (Confirmed)
Two separate chains:

1. Attested Chain (canonical truth)
   - `vault:seals:index:attested`
   - surfaced via `countSeals()`

2. Audit Chain (full history)
   - `vault:seals:index:all`
   - includes quarantined / rejected / unpromoted seals

Canon UI is currently reading from audit semantics,
while Vault UI reads only the attested chain.

## Resulting Mismatch
- Canon = "complete attestation"
- Vault = "not advanced to attested chain"

## Key Insight
"Complete attestation" ≠ "advanced to canonical chain"

A seal must:
- pass quorum
- be validated
- be appended via `appendSealToChain()`

to count as **attested canonical truth**.

---

## Replay Engine Mapping (Critical)
Replay currently reconstructs:
- hashes
- balances
- sources

But does NOT:
- re-evaluate quorum
- re-run attestation
- promote audit seals into attested chain

### Back-Attestation Design (future-safe)
Agents can "attest past blocks" only if:

1. Seal hash matches replay reconstruction
2. Deposit hash set matches
3. No conflicting chain successor exists

Then:

```
POST /api/vault/seal/back-attest
```

Should:
- verify replay integrity
- require quorum signatures
- call `appendSealToChain()`

---

## C-294 TODO (10 Optimizations)

### Data Integrity
1. Add `/api/debug/attestation-state` (done)
2. Expose `audit_complete_attestation_count` in Vault API
3. Add `is_canonical_attested` flag per seal

### UI / Operator Clarity
4. Add "audit vs attested" legend in Vault
5. Add mismatch warning badge when counts diverge
6. Show candidate attestation progress inline in Vault blocks

### Replay Improvements
7. Add replay check: "attestable_from_replay"
8. Surface missing quorum agents per historical seal

### Reserve Block Mechanics
9. Explicitly show:
   - block_complete
   - block_attested
   - block_canonical

### Consistency Enforcement
10. Prevent Canon from labeling "complete" unless seal is in attested index

---

## Principle

One truth:

- Canon = historical record
- Vault = canonical state

They must converge on:

> attested chain index

---

We heal as we walk.
