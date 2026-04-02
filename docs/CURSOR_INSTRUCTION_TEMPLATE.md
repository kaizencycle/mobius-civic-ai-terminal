# Cursor Cycle Instruction Template (C-623+)

Use this template for all C-623+ Cursor background-agent instructions to prevent duplicate PR fan-out and keep commit identity consistent.

## Standard Header (required)

```text
When committing work, commit directly to main with:
  git config user.name "mobius-bot"
  git config user.email "bot@mobius.substrate"
Do NOT open a pull request unless explicitly instructed.
Push directly: git push origin main
```

## Instruction Body Template

```text
Cycle: C-<N>
Objective: <one-sentence outcome>

Scope:
- <deliverable 1>
- <deliverable 2>

Constraints:
- Keep changes minimal and production-safe.
- Update docs for any operator-facing behavior changes.
- Run relevant checks before commit.

Execution:
1) Implement the scoped changes.
2) Run checks and summarize results.
3) Commit directly to main as mobius-bot.
4) Report exactly what changed and which checks ran.
```

## Operator Note

If `main` branch protection blocks direct pushes, either:

1. grant the Cursor actor bypass rights for required PR checks, or
2. explicitly instruct Cursor to open a PR for that specific cycle.

---

## Mobius Substrate header (v1.1) and Cloud Agent runs

Long-form cycle packets may include the **Mobius Substrate — Cursor Background Agent Instruction Header** (C-623, operator `kaizencycle`): GIT IDENTITY, STOP CONDITIONS, VERIFICATION, CONSTRAINTS, CLASS **A** (code) vs **B** (runtime/KV only), and a **TASK** block (prerequisites, steps, verification).

### Incomplete packets

If the header is present but **TASK** is unfilled (e.g. placeholders `C-NNN`, empty steps, CLASS not **A** or **B**), agents should **stop and report** — do not infer scope or ship code.

### When “direct-to-main only” meets a Cloud feature branch

The v1.1 header may require **no `cursor/*` branches** and **push to `main` only**. **Cursor Cloud** sessions for this repo are often bound to a **feature branch** (for example `cursor/cursor-agent-functionality-*`) with **push to that branch**.

When both appear:

- Follow the **Cursor Cloud session branch** and push there (`git push -u origin <branch>`) unless the operator has explicitly moved the session to `main`.
- Treat **direct-to-main** as authoritative only when the working branch is `main` **and** push permissions allow it.

For PR vs KV vs direct semantics, see [CURSOR_MODES.md](./ops/CURSOR_MODES.md) and [automation_policy.md](./ops/automation_policy.md).
