# Vault v3 Setup

## C-285 Draft

**Purpose:** Define the next production-ready Vault architecture for Mobius after tranche sealing, carry-forward balance, and Fountain gating became visible in the live Terminal.

---

## 0. Why Vault v3 exists

Vault v1 proved reserve accumulation.  
Vault v2 introduced tranche/seal-oriented state.  
Vault v3 should make the Vault:

- globally legible
- seal-chain aware
- attested
- replayable
- contributor-aware
- Fountain-safe
- future-ready for MIC burn/donate/seal actions

Vault v3 is the point where the Vault stops being a counter and becomes a protocol reserve machine.

---

## 1. Canonical design principles

1. **Global, not per-user**
   - the Vault is protocol-level reserve, not a personal wallet

2. **Seal the tranche, not the history**
   - every 50 units becomes a sealed tranche
   - carry-forward remains live

3. **Reserve can seal before integrity can unseal**
   - reserve threshold and Fountain threshold are different things

4. **Fountain unlock remains integrity-gated**
   - GI and sustain determine spendability
   - reserve alone does not trigger payout

5. **Every important state change must be attested**
   - seal events
   - unseal readiness
   - daily closes
   - future burn/donate/seal actions

6. **Vault must be replayable**
   - any validating node should be able to reconstruct Vault state from events + seals

---

## 2. Core vocabulary

### Reserve lane

The live accumulation path from validated system activity into the Vault.

### Tranche

A 50-unit reserve segment eligible to be sealed.

### Seal

A frozen, attested reserve tranche with its own sequence, hash, and metadata.

### Sealed reserve total

The sum of all attested tranches.

### In-progress balance

The carry-forward reserve amount accumulating toward the next tranche.

### Fountain

The spendable release gate. Fountain activation is separate from reserve sealing.

### Sustain

Consecutive cycles above GI threshold required to unlock Fountain.

---

## 3. Vault v3 state model

### Canonical state fields

```json
{
  "vault_id": "vault-global",
  "vault_version": 3,
  "sealed_reserve_total": 50.0,
  "in_progress_balance": 30.28,
  "tranche_size": 50.0,
  "seals_count": 1,
  "latest_seal_id": "seal-v1-0001",
  "latest_seal_hash": "<hash>",
  "latest_seal_at": "2026-04-17T18:04:12.028Z",
  "fountain_status": "locked",
  "reserve_lane_status": "accumulating",
  "gi_threshold": 0.95,
  "gi_current": 0.74,
  "preview_band": 0.88,
  "sustain_cycles_required": 5,
  "sustain_cycles_current": 0,
  "source_entries": 607,
  "last_deposit": "2026-04-18T18:03:21.768Z"
}
```

### Compatibility fields

Keep these only while older UI/code still depends on them:

- `balance_reserve`
- `activation_threshold`
- v1-style status aliases

### Canonical preference order

New surfaces should prefer:

1. `sealed_reserve_total`
2. `in_progress_balance`
3. `seals_count`
4. `fountain_status`
5. `sustain_cycles_current`

---

## 4. Event model

Vault v3 should move toward event-sourced state.

### Event types

- `vault_deposit`
- `vault_seal_candidate_created`
- `vault_seal_attested`
- `vault_seal_finalized`
- `vault_sustain_cycle_incremented`
- `vault_sustain_cycle_reset`
- `vault_fountain_unlocked`
- `vault_user_burn_contribution`
- `vault_user_donate_contribution`
- `vault_user_seal_lock`
- `vault_daily_close`

### Example event shape

```json
{
  "event_id": "evt_vault_0001",
  "event_type": "vault_deposit",
  "vault_id": "vault-global",
  "timestamp": "2026-04-18T18:03:21.768Z",
  "cycle": "C-285",
  "actor_type": "agent",
  "actor_id": "ZEUS",
  "source_entry_id": "journal-ZEUS-C-285-...",
  "deposit_amount": 0.3284,
  "journal_score": 0.71,
  "gi_at_deposit": 0.74,
  "content_signature": "...",
  "attestation": {
    "status": "committed"
  }
}
```

---

## 5. Seal chain model

Every sealed tranche becomes a chain object.

### Seal record shape

```json
{
  "seal_id": "seal-v1-0001",
  "vault_id": "vault-global",
  "sequence": 1,
  "cycle": "C-284",
  "sealed_at": "2026-04-17T18:04:12.028Z",
  "sealed_amount": 50.0,
  "carry_forward_balance": 0.94,
  "sealed_reserve_total_after": 50.0,
  "gi_at_seal": 0.81,
  "source_entries": 397,
  "fountain_status": "locked",
  "attestors": ["EVE", "ZEUS", "ATLAS"],
  "prev_seal_hash": null,
  "seal_hash": "<computed_hash>",
  "inscription": "Reserve can be sealed before integrity can unseal it."
}
```

### Rules

- every seal must have a sequence
- every seal after the first includes `prev_seal_hash`
- the seal chain must be replayable independently of the live tranche
- seals are canonical cold memory, not ephemeral UI state

---

## 6. Contribution model

Vault v3 should make contributions legible.

### Current source of reserve

Committed agent journal entries scored through:

- confidence
- novelty
- duplication decay
- GI weighting

### New v3 requirement

Expose grouped contribution summaries.

### Required breakdowns

- contributions by agent
- contributions by cycle
- average deposit per committed entry
- top deposit sources this cycle
- duplication decay effect
- GI-weight effect

### Example API response

```json
{
  "group_by": "agent",
  "cycle": "C-285",
  "totals": [
    { "agent": "ZEUS", "reserve": 8.92, "entries": 24 },
    { "agent": "ATLAS", "reserve": 7.31, "entries": 18 },
    { "agent": "EVE", "reserve": 5.88, "entries": 12 }
  ]
}
```

This is one of the biggest v3 upgrades because it turns reserve growth from a mystery into legible protocol behavior.

---

## 7. Fountain gate logic

Vault v3 must make the reserve-vs-fountain distinction explicit.

### Reserve seal condition

- `in_progress_balance >= 50`

### Fountain unlock condition

- reserve conditions satisfied
- `GI >= 0.95`
- sustain `>= 5 consecutive cycles`
- any required attestation/quorum present

### State labels

- `sealed`
- `preview`
- `tracking`
- `ready`
- `unsealed`
- `fountain_active`

### One-line canon

**Reserve can accumulate under pressure.  
Fountain remains constitutionally locked until integrity proves it.**

---

## 8. Sustain tracking

Vault v3 should stop saying “not tracked in KV yet.”

It needs explicit sustain state.

### Required fields

- `sustain_cycles_required`
- `sustain_cycles_current`
- `sustain_last_increment_cycle`
- `sustain_last_reset_cycle`
- `sustain_reason`

### Rules

- increment when GI closes cycle at or above threshold
- reset when GI falls below threshold
- persist to KV and include in API
- display in Terminal clearly

### Example

```json
{
  "sustain_cycles_required": 5,
  "sustain_cycles_current": 2,
  "sustain_last_increment_cycle": "C-291",
  "sustain_reason": "GI >= 0.95 at cycle close"
}
```

---

## 9. Daily close integration

Vault v3 should connect to the EVE daily closing seal path.

### At midnight / cycle close

EVE should publish:

- closing GI
- tranche state
- sealed reserve total
- in-progress balance
- sustain progress
- top contributors
- carryover risks

### Result

Vault is no longer just live state.  
It becomes part of the daily canonical archive.

---

## 10. User contribution extensions

Vault v3 should prepare for explicit human participation.

### Allowed future actions

- `burn_to_vault`
- `donate_to_vault`
- `seal_lock_to_vault`

### Critical distinction

These are explicit user actions.  
They are not automatic conversions from personal balances.

### Suggested fields

- `user_contribution_total`
- `user_burn_total`
- `user_donate_total`
- `user_lock_total`
- `contributors_count`

---

## 11. API surface

### Required endpoints

#### `GET /api/vault/status`

Canonical current state.

#### `GET /api/vault/seals`

List seals with hashes and metadata.

#### `GET /api/vault/contributions?group_by=agent`

Breakdown of reserve contributions.

#### `GET /api/vault/contributions?group_by=cycle`

Cycle-level contribution rollup.

#### `POST /api/vault/seal`

Finalize next seal when tranche threshold is met.

#### `GET /api/vault/sustain`

Return sustain tracking state.

#### `POST /api/vault/contribute`

Future route for user burn/donate/lock actions.

---

## 12. Terminal UI requirements

Vault v3 Terminal should show:

### Main state card

- sealed reserve total
- current tranche
- current GI
- Fountain status
- sustain progress
- last deposit
- last seal

### Seal card

- latest seal id
- sequence
- seal hash
- previous seal hash
- attestors

### Contribution card

- top contributing agents this cycle
- reserve gained by cycle
- avg deposit per entry
- duplication decay note

### Sustain card

- current sustain progress
- last reset
- unlock condition

### Daily continuity card

- last EVE close
- Vault state at close
- carryover to next cycle

---

## 13. Data migration path

### v1

- cumulative reserve only

### v2

- tranche / seal compatibility layer
- in-progress balance
- seal candidate concept

### v3

- canonical seal chain
- sustain tracking
- contributor breakdown
- replay-friendly event layer
- future user contribution support

### Migration rule

Do not hard break old surfaces immediately.  
Run compatibility fields until the Terminal and any dependent clients fully swap to v3 fields.

---

## 14. Suggested implementation order

### Phase 1 — state clarity

1. add `sealed_reserve_total`
2. add `sustain_cycles_current`
3. wire sustain tracking to KV
4. add `/api/vault/seals`

### Phase 2 — contribution visibility

5. add `/api/vault/contributions`
6. group by agent and cycle
7. add top contributors panel in Terminal

### Phase 3 — canonical memory

8. connect seal records to EVE daily close
9. add seal hash / prev hash display
10. archive seals to Substrate repo

### Phase 4 — human participation

11. add future user burn/donate/lock contribution routes
12. expose contributor count and totals

---

## 15. Recommended PR titles

### State and sustain

`feat(vault): add v3 sustain tracking and canonical reserve fields`

### Contributions

`feat(vault): expose v3 contribution breakdown by agent and cycle`

### Seal chain

`feat(vault): add v3 seal chain metadata and archive integration`

### Terminal UI

`feat(terminal): add vault v3 contribution, sustain, and seal surfaces`

---

## 16. One-line canon

**Vault v3 turns reserve into a legible protocol machine: sealed in tranches, unlocked by integrity, remembered by chain.**

---

**We heal as we walk.**

---

## Implementation note (repo ground truth, C-285)

Some items above overlap **Vault v2** work already present in this repository (for example `sealed_reserve_total` on status, `GET /api/vault/contributions`, and seal listing on `GET /api/vault/seal`). Treat this document as the **north-star spec**; implementation PRs should reconcile each section against `docs/protocols/vault-seal-i.md`, `docs/protocols/vault-v2-sealed-reserve.md`, and live routes before duplicating endpoints.
