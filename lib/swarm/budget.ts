// C-306 PR-512: Daily LLM budget tracker for the swarm cron.
// Reads/writes cumulative spend to KV. Blocks calls when DAILY_LLM_BUDGET_USD is exceeded.
// Budget resets at UTC midnight via TTL.
//
// Atomicity: spentUsd and callCount are tracked via Redis INCRBYFLOAT / INCRBY on
// separate numeric keys so concurrent cron invocations cannot overcount spend.
// The JSON metadata key is updated best-effort for date tracking and operator reads.

import { kvGetRaw, kvSetRawKey, kvIncrByFloatRaw, kvIncrByRaw, kvExpireRaw } from '@/lib/kv/store';

const BUDGET_KEY       = 'swarm:budget:daily';
const BUDGET_SPEND_KEY = 'swarm:budget:daily:spent';
const BUDGET_CALLS_KEY = 'swarm:budget:daily:calls';

export interface BudgetState {
  date: string;       // YYYY-MM-DD UTC
  spentUsd: number;
  callCount: number;
  lastUpdated: number;
}

// Approximate cost per 1k tokens (Haiku/Sonnet/Opus input+output blended)
const TIER_COST_PER_CALL_USD: Record<number, number> = {
  1: 0.002,  // Haiku  — light analysis
  2: 0.008,  // Sonnet — standard council
  3: 0.040,  // Opus   — deep adversarial / crosscheck
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function secondsUntilMidnightUtc(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

export async function loadBudget(): Promise<BudgetState> {
  const today = todayUtc();
  // Read the metadata blob and atomic counters in parallel
  const [raw, spentRaw, callsRaw] = await Promise.all([
    kvGetRaw<BudgetState>(BUDGET_KEY),
    kvGetRaw<number>(BUDGET_SPEND_KEY),
    kvGetRaw<number>(BUDGET_CALLS_KEY),
  ]);

  if (raw && raw.date === today) {
    // Prefer atomic counter values — they are concurrent-safe
    return {
      ...raw,
      spentUsd:  spentRaw  != null ? parseFloat(Number(spentRaw).toFixed(6))  : raw.spentUsd,
      callCount: callsRaw  != null ? Math.round(Number(callsRaw))              : raw.callCount,
    };
  }
  // New day — atomic counter keys will have expired (same TTL as metadata key)
  return { date: today, spentUsd: 0, callCount: 0, lastUpdated: Date.now() };
}

export async function recordSpend(tierCosts: number[]): Promise<BudgetState> {
  const added = tierCosts.reduce((sum, c) => sum + c, 0);
  const ttl   = secondsUntilMidnightUtc();
  const today = todayUtc();

  // Atomic increments — concurrent-safe via Redis INCRBYFLOAT / INCRBY
  const [newSpent, newCalls] = await Promise.all([
    kvIncrByFloatRaw(BUDGET_SPEND_KEY, added),
    kvIncrByRaw(BUDGET_CALLS_KEY, tierCosts.length),
  ]);

  // Refresh TTL on atomic counter keys (idempotent; worst-case effect is a slightly
  // different expiry time, not a spend accounting error)
  void Promise.all([
    kvExpireRaw(BUDGET_SPEND_KEY, ttl),
    kvExpireRaw(BUDGET_CALLS_KEY, ttl),
  ]);

  const spentUsd  = newSpent  != null ? parseFloat(Number(newSpent).toFixed(6))  : added;
  const callCount = newCalls  != null ? Math.round(Number(newCalls))              : tierCosts.length;

  // Update the metadata blob (best-effort — used for date tracking and operator reads)
  const next: BudgetState = { date: today, spentUsd, callCount, lastUpdated: Date.now() };
  await kvSetRawKey(BUDGET_KEY, next, ttl);
  return next;
}

export function dailyLimitUsd(): number {
  const raw = parseFloat(process.env.DAILY_LLM_BUDGET_USD ?? '0.50');
  return Number.isFinite(raw) && raw > 0 ? raw : 0.5;
}

export function tierCostUsd(tier: number): number {
  return TIER_COST_PER_CALL_USD[tier] ?? TIER_COST_PER_CALL_USD[2];
}

export function budgetRemaining(state: BudgetState): number {
  return Math.max(0, dailyLimitUsd() - state.spentUsd);
}

export function canAfford(state: BudgetState, tier: number): boolean {
  return budgetRemaining(state) >= tierCostUsd(tier);
}
