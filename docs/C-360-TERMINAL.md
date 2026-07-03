# C-360 Terminal sweep (PR-D)

**Cycle:** C-360 · **Repo:** mobius-civic-ai-terminal

## Scope

- **OPT-15:** Wire `evaluateJournalQuality` contract tests to `lib/tripwire/journalQuality.ts` (was inline stub).
- **OPT-09–14:** Already landed on `main` from prior cycles (identity probe, footer labels, next.config, tripwires).

## Operator follow-up

Set Vercel `IDENTITY_SERVICE_EMAIL` / `IDENTITY_SERVICE_PASSWORD` to match Render identity disk, redeploy, then drain reattest backlog via `POST /api/cron/reattest-seals`.
