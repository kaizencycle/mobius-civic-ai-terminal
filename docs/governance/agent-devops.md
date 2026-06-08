# Agent DevOps Guardrails (C-336)

The Mobius sentinels are also the Mobius DevOps team. The same constitution that
governs the substrate governs the agents-as-DevOps. Core rule: **agents author,
the operator ships.** Propose and merge are separated; the consequential lever
(shipping to prod, touching auth/identity/ledger math/the guardrails) stays
human, by protocol — not by hope. (The C-335 freeze — prod stuck ~2 days behind
~40 sentinel pushes — is the cautionary tale for *why* this has to be enforced
mechanically rather than assumed.)

## Pipeline

1. **Identity** — agents commit under a scoped GitHub App or fine-grained PAT,
   not the operator's account: `contents:write` to `agent/*`-style branches and
   `pull_requests:write` only. No `workflow:write`, no admin — an agent identity
   that is rotatable, scoped, and distinct from the operator, mirroring the
   service-account model in `lib/identity/`.
2. **Branch isolation** — agents push to `claude/*` / `cursor/*` (and any future
   `agent/*`) branches only. `scripts/ignore-build.sh` already treats those as
   non-deploying: agent work produces a Vercel *preview* deployment to inspect,
   never a production build. The ship lever is the merge to `main`, and the
   merge stays the operator's.
3. **scope-guard** (`scripts/scope-guard.sh`, run by `.github/workflows/scope-guard.yml`
   on every PR) — classifies the diff into the canonical tiers and enforces:
   - **Tier-3 paths are operator-only**: `lib/substrate/` (the C-333 token-truth
     surface), `auth.ts` + `lib/auth/` + `lib/identity/` (auth/identity), `lib/mic/`
     + `app/api/mic/` (MIC ledger settlement/chain-hash math), `lib/integrity/`
     (canon hash roots), the guardrail scripts and `.github/` itself, and
     deploy/infra config (`vercel.json`, `render.yaml`, `mobius.yaml`,
     `next.config.ts`, `package.json`, `pnpm-lock.yaml`). A Tier-3 edit by a
     non-owner **fails** the check — see `.github/scope-guard/protected-paths.txt`.
   - **Agent code changes require an EPICON receipt** — `epicon_id:` plus a
     rollback plan in the PR body, mirroring `PULL_REQUEST_TEMPLATE.md` §3/§7.
     The "why" is ledgered before the diff, same as any other consequential act.
   - Optional `STRICT_ALLOWLIST=true` confines agents to `agent-paths.txt`.
   - **Fails closed**: if the diff can't be proven (shallow checkout, bad refs),
     the gate blocks rather than silently passing — the deliberate inverse of
     `ignore-build.sh`'s fail-*open* posture, because the two gates protect
     against opposite risks (losing a deploy vs. waving through an unauthorized
     edit).
4. **CODEOWNERS + branch protection** (`.github/CODEOWNERS`,
   `scripts/setup-branch-protection.sh`) — Tier-3 paths require operator
   (CODEOWNER) review; required checks before merge: `scope-guard`, `contract`,
   `guard` (anti-nuke), `sentinel`, `gi-gate`.
5. **Ship gate** — `ignore-build.sh` only builds production for operator-authored
   or `[deploy]`-tagged commits (C-335), so an agent cannot force a production
   build even if a PR were merged by mistake.
6. **Reversibility as circuit breaker** — every merge is a Vercel deployment
   with instant rollback. Wire the GI breaker to it: if GI drops materially in
   the epoch after a merge, auto-promote the last known-good deployment and
   freeze further merges until cleared — the same doctrine already applied to
   MIC supply, applied to code.

## Tier map (mirrors `PULL_REQUEST_TEMPLATE.md` §2)

| Tier | Scope | Merge authority |
|------|-------|-----------------|
| 0 | Docs / comments / formatting | Agent PR + green checks |
| 1 | App logic, no schema/auth changes | Sentinel review → operator merge |
| 2 | KV key schema, journal schema, EPICON shape, signal domain | Operator review — no self-merge |
| 3 | MIC economy, identity, ledger integrity math, auth, the guardrails, infra | **Operator-only** — agents propose, never ship |

## The load-bearing guarantee

An agent must never be able to edit the thing that constrains agents.
`scripts/scope-guard.sh`, `scripts/ignore-build.sh`, `.github/CODEOWNERS`, and
every workflow under `.github/workflows/` are themselves listed in
`protected-paths.txt` — Tier-3, operator-only. This is what makes the guardrail
self-sustaining rather than advisory.

## Forcing a deploy

Agents never ship. To deploy a fix yourself: merge as the operator, or push an
empty commit tagged `[deploy]`:

```bash
git commit --allow-empty -m "ops: force prod deploy [deploy]"
```

## Rollout checklist (operator, post-merge)

1. Run `scripts/setup-branch-protection.sh` (requires `gh` with admin) to lock
   in required checks + CODEOWNER review.
2. Provision the scoped GitHub App / PAT for agents per step 1 above.
3. Once `agent-paths.txt` is trusted, flip `STRICT_ALLOWLIST` to `"true"` in
   `.github/workflows/scope-guard.yml`.
