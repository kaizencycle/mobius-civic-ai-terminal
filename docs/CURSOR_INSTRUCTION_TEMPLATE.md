# Cursor Cycle Instruction Template (C-623+)

Use this template for Cursor background-agent instructions so commit identity stays consistent and **execution mode** matches [`docs/ops/automation_policy.md`](ops/automation_policy.md) and [`docs/ops/CURSOR_MODES.md`](CURSOR_MODES.md).

## Modes (declare explicitly)

Every instruction should start with one of:

| Mode | When |
|------|------|
| **PR_MODE** | Source code, routes, UI, types, config, schemas, dependencies |
| **KV_RUNTIME_MODE** | Heartbeats, ZEUS/EPICON runtime writes, live feed — **no git** |
| **DIRECT_MAIN_MODE** | Only when the operator explicitly authorizes a direct push to `main` |

If no mode is declared, default to **PR_MODE** for code and **KV_RUNTIME_MODE** for live signals (per automation policy).

## Git identity (when committing)

For commits that should match the Mobius bot convention:

```text
git config user.name "mobius-bot"
git config user.email "bot@mobius.substrate"
```

Commit message format:

```text
feat|fix|chore|docs(scope): description (C-NNN)
```

## PR_MODE (default for implementation)

```text
Cycle: C-<N>
MODE: PR_MODE
Objective: <one-sentence outcome>

Scope:
- <deliverable 1>
- <deliverable 2>

Constraints:
- Keep changes minimal and production-safe.
- Update docs for any operator-facing behavior changes.
- Run relevant checks before commit.

Execution:
1) Implement the scoped changes on a feature branch (or the branch assigned by the automation).
2) Run checks and summarize results.
3) Commit with mobius-bot identity if policy requires it; open **one** PR for review unless told otherwise.
4) Report exactly what changed and which checks ran.
```

## KV_RUNTIME_MODE

```text
MODE: KV_RUNTIME_MODE
Objective: <runtime signal only>

Execution:
1) POST to the authorized runtime endpoints only.
2) Do not create branches, commits, or PRs.
3) Report endpoint responses and feed visibility.
```

## DIRECT_MAIN_MODE (explicit operator authorization only)

```text
MODE: DIRECT_MAIN_MODE
Objective: <low-risk, approved direct update>

Execution:
1) Apply the minimal change.
2) Commit as mobius-bot (see above).
3) git push origin main
4) If branch protection blocks the push: stop, report the exact error, do not work around it.
```

Add `[skip ci]` only to data/catalog/heartbeat-style commits when policy says so — never to hide code changes from CI.

## Operator note

Vercel may skip builds for `mobius-bot` / `[skip ci]` via `scripts/ignore-build.sh`. **Code** changes should still land through normal review (PR_MODE) so production does not miss required builds.

If `main` is protected and direct push fails, use **PR_MODE** or grant bypass per repository policy.

## Cloud / workspace overrides

Some Cursor Cloud tasks assign a fixed development branch (for example `cursor/...`). When that conflicts with an instruction block that says “direct-to-main only,” **follow the active workspace or automation mandate** and report the conflict to the operator if both cannot be satisfied.
