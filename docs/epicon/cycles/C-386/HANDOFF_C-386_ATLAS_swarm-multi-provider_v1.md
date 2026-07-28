# C-386 — ATLAS implementation handoff: swarm multi-provider LLM dispatch

**Status:** IMPLEMENTED (branch `cursor/c386-swarm-multi-provider-0e02`)  
**Risk:** LOW — additive dispatch; tier 2/3 Anthropic path unchanged; no activation/budget-gate/bus changes  
**Human authority:** Michael Judan

## Executive intent

Production incident C-386: swarm run `0/4 agents ok` with Anthropic `credit balance is too low`. Tier-1 agents (ECHO, HERMES, DAEDALUS when tier 1, ATLAS when healthy) can use a cheaper OpenAI-compatible backend so high-volume light analysis does not share the same billing cliff as Sonnet/Opus.

**Does not** top up Anthropic — operator billing action still required for tier 2/3.

## Pre-flight

| Check | Result |
|-------|--------|
| `openai` npm major vs Node 22 / TS 5.6 | `openai@^4.104.0` (OpenAI-compatible chat API) |
| Existing `OPENAI_COMPAT_*` env names | None in repo before this patch |
| `TIER_MODEL` assumed always `claude-*` | Only `route.ts` consumes models; no claude-only regex elsewhere |
| `canAfford` monotonic tier cost | Tier 1 cheaper than 2/3 — contract test asserts ordering |

## Pricing / endpoint verification (2026-07-28)

Source: [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing), [First API Call](https://api-docs.deepseek.com/quick_start).

| Item | Value |
|------|--------|
| Base URL (OpenAI format) | `https://api.deepseek.com` (default in code) |
| Tier-1 model id | `deepseek-v4-flash` (replaces deprecated `deepseek-chat` in handoff draft) |
| Input (cache miss) | $0.14 / 1M tokens |
| Output | $0.28 / 1M tokens |
| `TIER_COST_PER_CALL_USD[1]` | **$0.00035** — blended ~2k input + ~256 output @ flash rates, 512 max_tokens cap |

Override model via env only if you also set `TIER_MODEL[1]` in code or fork — no per-env model string yet.

## What changed

| File | Change |
|------|--------|
| `package.json` | `openai` dependency |
| `lib/swarm/activation.ts` | `TIER_PROVIDER`, `CREDIT_COOLDOWN_FALLBACK_*`, tier-1 → `deepseek-v4-flash` |
| `lib/swarm/budget.ts` | Tier-1 cost constant from DeepSeek flash pricing |
| `lib/swarm/parseAgentResponse.ts` | Shared JSON extraction for Anthropic + compat replies |
| `app/api/cron/swarm/route.ts` | Dual dispatch; gate = any provider configured |
| `tests/contract/swarmMultiProvider.test.ts` | Provider maps, route contract, JSON parser |

## Env (Vercel)

- `OPENAI_COMPAT_API_KEY` — DeepSeek (or OpenRouter) key  
- `OPENAI_COMPAT_BASE_URL` — optional; defaults to `https://api.deepseek.com`  
- `ANTHROPIC_API_KEY` — still required for tier 2/3 agents in the same run

## Tests required before seal

- [x] Tier 1 provider map + model id  
- [x] Route source: OpenAI-compat + Anthropic branches  
- [x] Gate: `no_llm_provider_configured` (not `ANTHROPIC_API_KEY_missing`)  
- [x] Credit fallback constants wired in route  
- [x] JSON extraction (fenced + bare)  
- [ ] Live smoke: one tier-1 agent against real DeepSeek (post-deploy, operator)

## Explicit non-goals

- Re-tiering ZEUS/AUREA/URIEL off Anthropic  
- Fixing Anthropic account balance  
- kv-watchdog / journal attest / epicon feed ledger timeout  

## ATLAS implementation report

1. **PRE-FLIGHT:** Pass (table above).  
2. **PRICING:** DeepSeek V4 Flash rates; model `deepseek-v4-flash` per current docs.  
3. **FILES:** See table.  
4. **TESTS:** `swarmMultiProvider.test.ts`.  
5. **LIVE TIER-1:** Not run in CI (no secrets); required at deploy smoke.  
6. **JSON-EXTRACTION:** No regex change needed for sample fenced/bare fixtures; live DeepSeek formatting TBD on smoke.  
7. **UNRESOLVED:** Whether to add `OPENAI_COMPAT_MODEL` env override without code change.  
8. **RECOMMENDATION:** **PASS** pending Vercel env + one production tier-1 cron tick.

## Human merge gate

Deploy with `OPENAI_COMPAT_API_KEY` set → confirm `[swarm] ECHO tier1 ok` (or HERMES) while Anthropic balance is depleted → Michael Judan merge.
