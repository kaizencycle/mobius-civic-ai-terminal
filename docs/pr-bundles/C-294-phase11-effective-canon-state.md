# C-294 Phase 11 — Effective Canon State

## Purpose
Introduce a read-only effective-state layer that explains how replay-approved overlays affect operator interpretation without mutating Vault, MIC, Fountain, or original Canon history.

## Phase 11 rules
- Effective state is derived, not original.
- Original seals remain preserved and inspectable.
- Replay mutation receipts may influence interpretation only after authorization + receipt checks pass.
- No Vault status mutation in this phase.
- No MIC or Fountain unlock in this phase.
- No rollback execution in this phase.

## TODO

### Step 1 — Effective State Contract
- [x] Define `EffectiveCanonBlock` shape.
- [x] Define `EffectiveCanonResponse` shape.
- [x] Preserve original status and derived effective status separately.

### Step 2 — Read-only Effective State Builder
- [x] Add helper that reads substrate Canon blocks.
- [x] Reads replay mutation receipt overlays.
- [x] Computes derived fields only.

### Step 3 — API Endpoint
- [x] Add `GET /api/substrate/effective-state`.
- [x] Support `seal_id` query.
- [x] Return counts without mutation.

### Step 4 — UI / Canon Wiring
- [ ] Add read-only effective-state panel in Canon or Replay.
- [ ] Show original status vs effective status.
- [ ] Show receipt hash and overlay reason.

### Step 5 — Guardrail Tests / Build
- [ ] Typecheck.
- [ ] Build.
- [ ] Lint.
- [ ] Verify endpoint against a quarantined seal without receipt.
- [ ] Verify endpoint against a replay-receipted seal.

## Stop before Phase 12
Phase 11 must stop before any effective-state result changes Vault totals, MIC availability, Fountain gate, or chain lineage.
