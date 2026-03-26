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
