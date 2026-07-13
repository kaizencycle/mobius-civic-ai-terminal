# Cycle C-370 — Canon/Runtime Reconciliation

**Status:** In progress — items 1–2 resolved; items 3–20 open  
**Prior seal:** C-369 — DISPUTED

## Artifacts (read in order)

| # | Document | Role |
|---|----------|------|
| 1 | [`HANDOFF_C-370_Michael-to-ATLAS_opener.md`](./HANDOFF_C-370_Michael-to-ATLAS_opener.md) | Original custodian handoff (Michael → ATLAS), 20 optimizations + live telemetry; post-archive status update at top |
| 2 | [`EPICON_C-370_GOVERNANCE_mic-issuance-ratification_v1.md`](./EPICON_C-370_GOVERNANCE_mic-issuance-ratification_v1.md) | Items 1–2 resolution — doctrine ratification + earnMIC gate ([PR #597](https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/597)) |
| 3 | [`HANDOFF_C-370_ATLAS-to-AUREA_remaining-items.md`](./HANDOFF_C-370_ATLAS-to-AUREA_remaining-items.md) | Items 3–20 continuation for AUREA ([PR #598](https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/598)) |
| — | [`OPERATOR_C-370_item-5_reserve-block-backlog-export.md`](./OPERATOR_C-370_item-5_reserve-block-backlog-export.md) | **Operator action** — item 5 backlog `.dat` export (config/ops, not code) |
| — | [`HANDOFF_C-370_chain-continuity-audit.md`](./HANDOFF_C-370_chain-continuity-audit.md) | **P0** — hot KV `prev_seal_hash` lineage confirmed: 3 components, 119 dual-quorum collisions |
| — | [`FINDINGS_C-370_chain-continuity-kv-audit.md`](./FINDINGS_C-370_chain-continuity-kv-audit.md) | **Confirmed** — production KV audit JSON summary (2026-07-13) |
| — | [`NOTE_C-370_Michael-to-ATLAS_chain-continuity-reframe.md`](./NOTE_C-370_Michael-to-ATLAS_chain-continuity-reframe.md) | Custodian ack — scope correction accepted; findings confirmed |
| — | [`NOTE_C-370_Michael-governance-no-reset.md`](./NOTE_C-370_Michael-governance-no-reset.md) | Custodian position — C-359 not intentional; ZEUS catalog timeline |

## Operator actions (no code change)

| Item | Action | Doc |
|------|--------|-----|
| 5 | Prime reserve block cold canon (349-block backlog → ~4 `.dat` files) | [OPERATOR item 5](./OPERATOR_C-370_item-5_reserve-block-backlog-export.md) |

## Doctrine anchor

`docs/protocols/mic/mic_issuance_protocol.md` — reward accounting vs. mint authorization split (ratified in C-370).
