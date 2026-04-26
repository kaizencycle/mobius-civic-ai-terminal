# C-293 — Reserve Blocks

## Purpose

Rename the operator-facing Vault unit from **tranche** to **Reserve Block**.

A Reserve Block is one canonical 50 MIC reserve parcel. The internal API may keep legacy `tranche` fields for compatibility, but the Terminal should teach the operator the cleaner mental model:

```txt
1 Reserve Block = 50 MIC reserve units
```

## Why this makes sense

The Vault already behaves like a block system:

- deposits accumulate into a fixed 50-unit parcel;
- one seal candidate forms per parcel;
- one quorum attestation finalizes the parcel;
- each finalized parcel has a hash;
- carried-forward overflow starts the next parcel.

So “Block” is not cosmetic. It is the accurate model for the reserve ledger.

## Compatibility rule

Do not break existing callers. Keep these fields for now:

- `current_tranche_balance`
- `carry_forward_in_tranche`
- `reserve_threshold_met`

Add the new canonical operator-facing fields:

- `reserve_block`
- `reserve_block_label`
- `reserve_block_size`
- `reserve_blocks_completed_v1`
- `reserve_blocks_sealed`
- `reserve_blocks_audit`
- `reserve_block_in_progress`
- `reserve_block_progress_pct`

## UI changes

Vault chamber now displays:

- `Vault · Reserve Blocks`
- `Reserve Block seal`
- current Block progress
- Block history rows
- attested / pending quorum / compat complete / in progress states

Example:

```txt
Block 1  50.00 MIC  pending quorum
Block 2  50.00 MIC  pending quorum
Block 3  50.00 MIC  pending quorum
Block 4  24.17 MIC  in progress
```

## Important semantic guard

A Reserve Block can seal before the Fountain unlocks.

- Block seal = proof/accounting event
- Fountain unlock = economic activation event
- Fountain still requires GI sustain

## Canon

One Reserve Block equals one 50-unit reserve parcel.

Blocks prove accumulation.
GI sustain proves readiness.
Fountain remains locked until integrity conditions pass.

We heal as we walk.
