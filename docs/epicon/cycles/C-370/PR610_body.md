## EPICON-02 INTENT PUBLICATION

```intent
epicon_id: EPICON_C-370_INFRA_cycle-state-v2_v1
ledger_id: mobius:kaizencycle
scope: infra
mode: normal
issued_at: 2026-07-12T21:10:00Z
expires_at: 2026-10-10T21:10:00Z
justification: |
  Agents and operators repeatedly reconstructed hot vs cold reserve counts from
  scattered PRs (354 raw vs 194 unique vs 313 attested). Extend existing
  ledger/cycle-state.json publisher to MOBIUS_CYCLE_STATE_V2 with explicit
  field bindings, gi_readings, chain tip, and open_gates.

  VALUES INVOKED: integrity, observability, custodianship
  REASONING: One file read per cycle replaces five-PR archaeology; builds on
  publish-cycle-state.yml rather than a parallel artifact tree.
  ANCHORS:
  - docs/epicon/cycles/C-370/CYCLE_STATE_V2.md
  - scripts/mesh/write-cycle-state.js
  - .github/workflows/publish-cycle-state.yml
  BOUNDARIES: Does not run KV collision audit in public workflow; seals_unique
  remains null until integrity cron or operator audit supplies it.
  COUNTERFACTUAL:
  - If vault/status unavailable, hot block is null but snapshot fields persist
  - If MANIFEST fetch fails, cold block records manifest_fetch_failed
```
