# C-377 — Reserve Block truth-surface precision

**Status:** OPEN — display honesty patch  
**Successor to:** [#631](https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/631) (attest alias @ `346cdc13`)

## Artifacts

| Document | Description |
|----------|-------------|
| [EPICON_C-377_TERMINAL_reserve-block-truth-precision_v1.md](./EPICON_C-377_TERMINAL_reserve-block-truth-precision_v1.md) | EPICON intent + witness anchors |
| [HANDOFF_C-377_ATLAS_reserve-block-truth-precision_v1.md](./HANDOFF_C-377_ATLAS_reserve-block-truth-precision_v1.md) | ATLAS → Terminal build agent handoff @ 2026-07-20T02:10Z |

## Active constraints

- Do **not** mutate production KV from this PR (audit `--write-kv` is operator-only)
- Do **not** change seal-integrity gate logic
- Do **not** apply Track R reconciliation receipts (Lane C / custodian)
- Collision membership is **read** from `watchdog:collision:affected-blocks`, never UI-derived
