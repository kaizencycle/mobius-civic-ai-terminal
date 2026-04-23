# Automation Canon

For Mobius Terminal automation policy and execution mode rules, see:

- [`docs/ops/automation_policy.md`](docs/ops/automation_policy.md)
- [`docs/ops/CURSOR_MODES.md`](docs/ops/CURSOR_MODES.md)

## One-line canon

> **Code belongs in Git. Signals belong in KV. Review belongs in PRs. Runtime belongs in the ledger.**

## Quick split

- **PR_MODE** → source-code and docs changes
- **KV_RUNTIME_MODE** → live operational events, heartbeats, ZEUS signals, EPICON runtime feed writes
- **DIRECT_MAIN_MODE** → only when explicitly approved for low-risk direct updates
