# C-385 — License compliance sweep (handoff + nuance)

**Status:** Proposal for custodian ratification (terminal repo). Does not introduce a new
license standard — aligns with C-360 ratified posture in
`Mobius-Substrate/configs/license-policy.yaml` (2026-07-02).

## Posture (unchanged)

| Layer | SPDX |
|-------|------|
| Code | AGPL-3.0-or-later + Ethical Addendum (non-binding) |
| Docs / handbook | CC-BY-SA-4.0 |
| Research / citations data | CC0-1.0 |

## Tooling nuance (correction)

- **Authoritative license text:** root `LICENSE` (GitHub license detection uses Licensee on that file).
- **`package.json` `license` field:** ecosystem metadata (npm, SPDX scanners) — should match `LICENSE`, but does not replace it.

## Repo actions

| Repo | Action | Merge gate |
|------|--------|------------|
| Mobius-Substrate | `package.json` MIT → AGPL-3.0-or-later | Safe — bug fix vs own LICENSE |
| mobius-civic-ai-terminal | Add LICENSE + ETHICAL_ADDENDUM + package field | **Custodian ratification** |
| mobius-hive | Same as terminal | **Custodian ratification** |
| Civic-Protocol-Core | No change proposed (MIT); document explicit exception in policy | Custodian decision |
| mobius-browser-shell | MIT — no carve-out in policy | Fresh custodian decision (AGPL vs explicit MIT exception) |

## Out of scope

CC0 is not applied to source code in this sweep; it remains scoped to research/citation
paths per C-360.

**Report discloses; repo witnesses.**
