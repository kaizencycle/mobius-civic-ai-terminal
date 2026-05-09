// C-306 PR-512: Daily LLM budget tracker for the swarm cron.
// Reads/writes cumulative spend to KV. Blocks calls when DAILY_LLM_BUDGET_USD is exceeded.
// Budget resets at UTC midnight via TTL.

import { kvGetRaw, kvSetRawKey } from '@/lib/kv/store';

const BUDGET_KEY = 'swarm:budget:daily';

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
  const raw = await kvGetRaw<BudgetState>(BUDGET_KEY);
  const today = todayUtc();
  if (raw && raw.date === today) return raw;
  // Stale or missing — start fresh
  return { date: today, spentUsd: 0, callCount: 0, lastUpdated: Date.now() };
}

export async function recordSpend(tierCosts: number[]): Promise<BudgetState> {
  const state = await loadBudget();
  const added = tierCosts.reduce((sum, c) => sum + c, 0);
  const next: BudgetState = {
    date: state.date,
    spentUsd: parseFloat((state.spentUsd + added).toFixed(6)),
    callCount: state.callCount + tierCosts.length,
    lastUpdated: Date.now(),
  };
  await kvSetRawKey(BUDGET_KEY, next, secondsUntilMidnightUtc());
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
