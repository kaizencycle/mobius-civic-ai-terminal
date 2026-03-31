# Cursor Cycle Instruction Template (C-623+)

Use this template for all C-623+ Cursor background-agent instructions to prevent duplicate PR fan-out and keep commit identity consistent.

**Version:** 1.1 (established C-623) — full substrate header below.

---

## Standard header (copy into every C-NNN instruction)

Replace `C-NNN` with the cycle number. Fill in the **TASK** section. Do not modify GIT IDENTITY, EXECUTION MODE, STOP CONDITIONS, or CONSTRAINTS blocks when copying.

```text
# ══════════════════════════════════════════════════════════════════════════════
# MOBIUS SUBSTRATE — CURSOR BACKGROUND AGENT INSTRUCTION HEADER
# Version: 1.1 | Established: C-623 | Operator: kaizencycle
#
# COPY THIS ENTIRE HEADER AT THE TOP OF EVERY C-NNN INSTRUCTION.
# Replace C-NNN with the cycle number. Fill in TASK section below.
# Do not modify GIT IDENTITY, EXECUTION MODE, STOP CONDITIONS, or CONSTRAINTS.
# ══════════════════════════════════════════════════════════════════════════════

# INSTRUCTION: C-NNN — [TASK TITLE]
# [One sentence describing what this instruction accomplishes.]

# ── EXECUTION MODE ────────────────────────────────────────────────────────────
#
# Direct-to-main only.
#   - Do NOT create a feature branch
#   - Do NOT open a pull request (draft or otherwise)
#   - Do NOT create cursor/* branches
#   - Do NOT create any branch at all
#
# If a direct push to main is blocked by branch protection, repository rules,
# or bot/app permissions:
#   → Stop immediately
#   → Report the exact blocking rule or error message
#   → Do not attempt workarounds

# ── GIT IDENTITY ──────────────────────────────────────────────────────────────
#
# Run once at the start of the session before any commits:
#
#   git config user.name "mobius-bot"
#   git config user.email "bot@mobius.substrate"
#
# Commit message format:
#   feat|fix|chore|docs(scope): description (C-NNN)
#   Example: feat(epicon): wire KV write to heartbeat route (C-623)
#
# Then push directly:
#   git push origin main
#
# Add [skip ci] only to data/heartbeat/catalog commits — never to code changes.

# ── STOP CONDITIONS ───────────────────────────────────────────────────────────
#
# HALT immediately and report to operator — do NOT retry — if any of the
# following are true at the start of or during this instruction:
#
# 1. INFRASTRUCTURE NOT READY
#    A required env var is missing, or a prerequisite API returns an error
#    indicating it is not provisioned (e.g. { configured: false }, 503,
#    "Env vars not set").
#    → Report exactly which env var or service is missing
#    → Do not attempt workarounds
#    → Do not open a PR
#    → Do not retry
#
# 2. VERIFICATION BLOCKED BY MISSING INFRASTRUCTURE
#    A post-deploy check fails because a service (KV, Redis, external API)
#    is not yet configured. This is NOT a code failure.
#    → Report: "Verification blocked: [service] not provisioned."
#    → Halt. Do not loop.
#
# 3. TASK ALREADY COMPLETE
#    The code changes in this instruction already exist in main.
#    → Report completion and stop
#    → Do not re-apply or open a duplicate PR
#
# 4. CONFLICT OR AMBIGUITY REQUIRING OPERATOR JUDGMENT
#    The instruction contradicts existing code in a way that requires
#    a design decision (breaking change, two valid approaches, etc.)
#    → Report the conflict clearly
#    → Halt. Do not pick arbitrarily.
#
# RETRY is only appropriate for:
#   - Transient network errors during fetch/push (max 2 retries)
#   - TypeScript/build errors introduced by this instruction's own changes
#     (max 1 fix cycle — fix, redeploy, re-verify, then stop either way)
#
# NEVER retry for infrastructure or env var issues.
# One clear report to the operator, then stop.

# ── VERIFICATION ──────────────────────────────────────────────────────────────
#
# After every deploy, run all verification steps listed in the TASK section.
# Report every result explicitly:
#   ✅ [check] — [response summary]
#   ❌ [check] — [response summary] — [reason if known]
#
# On failure:
#   - Code failure → fix once, redeploy, re-verify, report final state
#   - Infrastructure failure → halt per STOP CONDITIONS, report to operator
#   - Do not silently patch around failures

# ── CONSTRAINTS ───────────────────────────────────────────────────────────────
#
# - TypeScript strict mode must pass — no `any` in new code
# - No new npm dependencies without listing them in the commit message
# - All new API routes must return { ok: true|false } at top level
# - Never delete or overwrite existing EPICON ledger entries
# - KV/Redis writes must always be additive (lpush + ltrim cap 500)
# - Never await writeEpiconEntry in heartbeat or agent routes — fire-and-forget
# - Never surface KV/Redis errors in client API responses
# - Do not modify C-621 protected files:
#     src/app/api/epicon/feed/route.ts
#     src/app/api/ledger/backfill/route.ts
# - Do not add console.log to production code — use console.error for failures only

# ══════════════════════════════════════════════════════════════════════════════
# AUTOMATION CLASS (fill in one)
# ══════════════════════════════════════════════════════════════════════════════
#
# CLASS A — Code-shaping
#   Modifies application source files, routes, components, or config.
#   Always triggers a Vercel deploy.
#   Commits go to main directly (per EXECUTION MODE above).
#   Example: adding a new API route, refactoring a component.
#
# CLASS B — Runtime / Ledger / Data
#   Writes heartbeat state, EPICON entries, catalog snapshots, or agent signals.
#   Uses KV/Redis writes only — NO git commits, NO deployments triggered.
#   If this instruction involves only data writes, skip git entirely.
#   Example: heartbeat cron, ZEUS verification sweep, catalog snapshot.
#
# This instruction is CLASS: [ A / B ]

# ══════════════════════════════════════════════════════════════════════════════
# TASK — C-NNN: [TASK TITLE]
# ══════════════════════════════════════════════════════════════════════════════
#
# PREREQUISITES
# [ List env vars, services, or prior cycles required before starting. ]
# Example:
#   - UPSTASH_REDIS_REST_URL must be set in Vercel env (Production + Preview)
#   - C-622 must be merged to main
#   - GET /api/kv/health must return { available: true } before proceeding
#
# STEPS
# 1. [ First step ]
# 2. [ Second step ]
# ...
#
# VERIFICATION
# Run after deploy. Report all results as ✅ or ❌.
# 1. GET /api/[route] — expected: { ok: true, ... }
# 2. ...
#
# COMPLETION COMMIT
# On success:
#   git config user.name "mobius-bot"
#   git config user.email "bot@mobius.substrate"
#   git add .
#   git commit -m "[type](scope): [description] (C-NNN)"
#   git push origin main
```

---

## Cursor Cloud Agent note

When this repository is driven by **Cursor Cloud** with a designated `cursor/*` work branch, that environment’s git instructions override **EXECUTION MODE** for that run: commit and push to the assigned branch, not `main`, unless the operator explicitly opts into direct-to-main for that job.

---

## Operator note (branch protection)

If `main` branch protection blocks direct pushes for mobius-bot:

1. Grant the automation actor bypass for required checks, or  
2. Explicitly instruct the agent to open a PR for that cycle, or  
3. Use a Cloud Agent work branch and merge via normal review.

If infrastructure or env vars are missing, **do not** retry or work around — report and halt per STOP CONDITIONS above.
