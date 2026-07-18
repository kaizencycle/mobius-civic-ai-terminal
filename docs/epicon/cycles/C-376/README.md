# C-376 — Reserve Block truth surface & federation triage

**Status:** OPEN — recovery active / integrity gate engaged  
**Primary PR:** [#630](https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/630) (Terminal)

## Artifacts

| Document | Description |
|----------|-------------|
| [RESERVE_BLOCK_TRUTH_SURFACE.md](./RESERVE_BLOCK_TRUTH_SURFACE.md) | Canon → Ledger → UI truth model; canonical count invariant |
| [EPICON_C-376_TERMINAL_reserve-block-truth-surface_v1.md](./EPICON_C-376_TERMINAL_reserve-block-truth-surface_v1.md) | EPICON intent (PR #630) |
| [HANDOFF_C-376_ATLAS_terminal-log-triage.md](./HANDOFF_C-376_ATLAS_terminal-log-triage.md) | ATLAS federation witness @ 2026-07-18T14:10Z |

## Active constraints

- Do **not** disable `SEAL_INTEGRITY_GATE`
- Do **not** mutate production KV / apply Track R without approvals
- Do **not** treat `seals_count` or ATLAS self-reported GI as canonical truth
