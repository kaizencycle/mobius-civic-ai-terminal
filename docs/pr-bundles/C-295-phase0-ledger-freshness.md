# C-295 Phase 0 — Ledger Freshness + Cycle Alignment

## Purpose
Make the Ledger chamber honest about freshness and cycle alignment before adding multi-agent ledger writes.

## Observed issue
Production logs on 2026-04-28 show live C-295 activity from cron routes and journal/vault writes, while `/terminal/ledger` can still display C-293 rows without an explicit stale-cycle warning.

## Scope
- Add freshness metadata to `/api/chambers/ledger`.
- Surface current cycle vs latest displayed ledger row cycle in `/terminal/ledger`.
- Add stale-cycle warning when displayed rows lag active cycle.
- Add current-cycle-only / all-cycles toggle.
- Keep ledger write paths unchanged.

## NOT touching
- No ledger write adapters.
- No agent expansion.
- No EPICON feed write semantics.
- No Vault, MIC, Fountain, Canon, or replay mutation logic.
- No seed data to mask empty states.

## TODO

### Step 1 — API freshness metadata
- [x] Add `freshness.activeCycle`.
- [x] Add `freshness.latestRowCycle`.
- [x] Add `freshness.cycleLag`.
- [x] Add `freshness.staleRows`.
- [x] Add `freshness.currentCycleRows`.
- [x] Add `freshness.warning`.

### Step 2 — UI honesty
- [x] Show active cycle and latest row cycle separately.
- [x] Show stale-cycle warning when lag > 0.
- [x] Keep stale rows visible but labeled.

### Step 3 — Current cycle filter
- [x] Add UI toggle: current cycle / all cycles.
- [x] Do not hide empty current-cycle state; label it honestly.

### Step 4 — Validation
- [ ] `pnpm exec tsc --noEmit`
- [ ] `pnpm build`
- [ ] `pnpm lint`
- [ ] Verify `/api/chambers/ledger` returns freshness metadata.
- [ ] Verify `/terminal/ledger` labels stale C-293 rows while active cycle is C-295.

## Stop condition
Stop before changing ledger write paths or allowing non-ECHO agents to write to the ledger.
