## EPICON-02 INTENT PUBLICATION

```intent
epicon_id: EPICON_C-370_INFRA_cycle-state-v2_v1
ledger_id: mobius:kaizencycle
scope: specs
mode: normal
issued_at: 2026-07-12T21:10:00Z
expires_at: 2026-10-10T21:10:00Z
justification:
  VALUES INVOKED: integrity, observability, custodianship
  REASONING: Extend ledger/cycle-state.json to MOBIUS_CYCLE_STATE_V2 with explicit hot/cold field bindings, gi_readings, chain tip, and open_gates so agents read one federation pulse per cycle.
  ANCHORS:
    - docs/epicon/cycles/C-370/CYCLE_STATE_V2.md
    - scripts/mesh/write-cycle-state.js
    - .github/workflows/publish-cycle-state.yml
  BOUNDARIES: Public workflow does not run KV collision audit; seals_unique_block_number remains null until integrity cron or operator audit.
  COUNTERFACTUAL: If live inputs are partial, publish snapshot fields and null hot/cold rather than inventing counts.
counterfactuals:
  - If vault/status is unavailable, hot block is null but snapshot-lite fields still publish.
  - If MANIFEST fetch fails, cold block records manifest_fetch_failed and open_gates omit cold_canon_append_pending.
  - If gap math is questioned, operators run scripts/audit-reserve-block-collisions.ts for deduped unique count.
```
