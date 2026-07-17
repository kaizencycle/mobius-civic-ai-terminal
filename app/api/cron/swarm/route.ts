// C-306 PR-512: Swarm orchestrator cron — GET /api/cron/swarm
// Schedule: */30 * * * * (C-354 normalization — see vercel.json)
//
// Flow:
//   1. Load signal snapshot from KV (written by /api/cron/sweep)
//   2. Load bus state (previous agent results) for cross-agent checks
//   3. Check budget — skip run if daily limit exhausted
//   4. Evaluate activation conditions for each agent
//   5. Fan out Claude calls for active agents (respects tier + budget)
//   6. Write results to swarm bus KV
//   7. Log tier routing summary

import type { NextRequest } from 'next/server';
import { log } from '@/lib/log';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getEveSynthesisAuthError } from '@/lib/security/serviceAuth';
import { loadGIState } from '@/lib/kv/store';
import { kvGetRaw, kvSetRawKey } from '@/lib/kv/store';
import {
  ACTIVATION_CONDITIONS,
  AGENT_INSTRUCTIONS,
  TIER_MODEL,
  type SwarmSignals,
} from '@/lib/swarm/activation';
import {
  readAllBusEntries,
  writeBusEntry,
  extractConfidence,
  type AgentBusEntry,
} from '@/lib/swarm/bus';
import {
  loadBudget,
  recordSpend,
  canAfford,
  tierCostUsd,
  budgetRemaining,
  dailyLimitUsd,
} from '@/lib/swarm/budget';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';

const CREDIT_EXHAUSTED_KEY = 'swarm:credit-exhausted:ts';
const CREDIT_EXHAUSTED_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MAX_TIER_GT1_PER_RUN = 2;

function maxTierGt1PerRun(): number {
  const raw = Number(process.env.SWARM_MAX_TIER_GT1_PER_RUN ?? DEFAULT_MAX_TIER_GT1_PER_RUN);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_TIER_GT1_PER_RUN;
}

async function isAtlasCreditExhausted(): Promise<boolean> {
  const ts = await kvGetRaw<number>(CREDIT_EXHAUSTED_KEY);
  if (!ts) return false;
  return Date.now() - Number(ts) < CREDIT_EXHAUSTED_COOLDOWN_MS;
}

async function markCreditExhausted(): Promise<void> {
  await kvSetRawKey(CREDIT_EXHAUSTED_KEY, Date.now(), 3600);
}

export const dynamic = 'force-dynamic';
// Swarm calls can take up to 90s total across all agents
export const maxDuration = 90;

const SWARM_HEARTBEAT_KEY = 'swarm:heartbeat';

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

async function loadSwarmSignals(cycleId: string): Promise<SwarmSignals> {
  const gi = await loadGIState();
  // Also pull the latest micro-signals cache for instrument error counts
  const micro = await kvGetRaw<{
    errors?: number;
    instrumentCount?: number;
    fallbacksUsed?: number;
  }>('signals:micro:cache:v2');

  const microData = (micro as { data?: { errors?: number; instrumentCount?: number; fallbacksUsed?: number } } | null)?.data ?? micro;

  const tripwire = await kvGetRaw<{ elevated?: boolean; critical?: boolean }>('tripwire:state');

  return {
    gi: gi?.global_integrity ?? 0.75,
    errors: microData?.errors ?? 0,
    instrumentCount: microData?.instrumentCount ?? 40,
    fallbacksUsed: microData?.fallbacksUsed ?? 0,
    tripwireActive: Boolean(tripwire?.elevated || tripwire?.critical),
    cycleId,
  };
}

async function callAgent(
  client: Anthropic,
  agentId: string,
  tier: number,
  signals: SwarmSignals,
  busState: Record<string, unknown>,
  creditExhausted: boolean,
): Promise<{ result: unknown; durationMs: number; error: string | null }> {
  const start = Date.now();
  const model = TIER_MODEL[tier] ?? TIER_MODEL[2];
  const instruction = AGENT_INSTRUCTIONS[agentId];
  if (!instruction) {
    return { result: null, durationMs: 0, error: `no_instruction_for_${agentId}` };
  }

  const context = JSON.stringify({
    signals,
    agentResults: Object.fromEntries(
      Object.entries(busState).map(([k, v]) => [k, (v as AgentBusEntry)?.result ?? null]),
    ),
    timestamp: new Date().toISOString(),
  });

  // C-343: credit-exhausted state is resolved once per run by the caller; the per-agent
  // per-cycle "credit-exhausted fallback" warn (logged for every tier>1 agent during the
  // whole 1h cooldown) is summarised in one line by GET() instead of spamming the stream.
  const effectiveModel = creditExhausted && tier > 1
    ? TIER_MODEL[1] // fall back to Haiku when ATLAS credits are exhausted
    : model;

  try {
    const msg = await client.messages.create({
      model: effectiveModel,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `${instruction}\n\nContext:\n${context}`,
        },
      ],
    });

    const text = msg.content.find((b) => b.type === 'text')?.text ?? '';
    let result: unknown = null;
    try {
      // Extract JSON from the response (may be wrapped in ```json blocks)
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/({[\s\S]*})/);
      result = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(text);
    } catch {
      result = { raw: text };
    }

    return { result, durationMs: Date.now() - start, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('credit balance')) {
      console.warn('[swarm] state: entering ATLAS credit cooldown (1h) — tier>1 agents will route to Haiku');
      await markCreditExhausted();
    }
    return {
      result: null,
      durationMs: Date.now() - start,
      error: msg,
    };
  }
}

export async function GET(request: NextRequest) {
  const authErr = getEveSynthesisAuthError(request);
  if (authErr) return authErr;

  const runStart = Date.now();
  const cycle = await resolveOperatorCycleId();

  const client = getClient();
  if (!client) {
    console.warn('[swarm] ANTHROPIC_API_KEY not set — swarm skipped');
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY_missing', cycle });
  }

  // 1. Load signals + budget + bus state
  const [signals, budget, busState, prevHeartbeat] = await Promise.all([
    loadSwarmSignals(cycle),
    loadBudget(),
    readAllBusEntries(Object.keys(ACTIVATION_CONDITIONS)),
    kvGetRaw<{ creditExhausted?: boolean }>(SWARM_HEARTBEAT_KEY),
  ]);

  const remainingUsd = budgetRemaining(budget);
  if (remainingUsd <= 0) {
    console.warn(`[swarm] daily budget exhausted ($${dailyLimitUsd()} limit)`);
    return NextResponse.json({
      ok: false,
      error: 'budget_exhausted',
      budget: { spentUsd: budget.spentUsd, limitUsd: dailyLimitUsd() },
      cycle,
    });
  }

  // 2. Evaluate activation conditions
  const activated: { agentId: string; tier: number }[] = [];
  const skipped: { agentId: string; reason: string }[] = [];

  for (const [agentId, cond] of Object.entries(ACTIVATION_CONDITIONS)) {
    if (!cond.shouldActivate(signals, busState)) {
      skipped.push({ agentId, reason: 'condition_not_met' });
      continue;
    }
    const tier = cond.tier(signals, busState);
    if (!canAfford(budget, tier)) {
      skipped.push({ agentId, reason: `budget_insufficient_tier${tier}` });
      continue;
    }
    activated.push({ agentId, tier });
  }

  if (activated.length === 0) {
    log.info(`[swarm] no agents activated @ ${cycle} (gi=${signals.gi.toFixed(3)})`);
    return NextResponse.json({
      ok: true,
      activated: 0,
      skipped: skipped.length,
      signals,
      budget: { spentUsd: budget.spentUsd, remainingUsd, limitUsd: dailyLimitUsd() },
      cycle,
    });
  }

  // 3. Fan out agent calls (sequential to respect budget deduction between calls)
  const results: AgentBusEntry[] = [];
  const tiersUsed: number[] = [];
  let currentBudget = budget;

  // C-343: resolve the ATLAS credit-exhausted cooldown once per run and log a single
  // summary line, instead of warning per agent per cycle for the full 1h cooldown window.
  const creditExhausted = await isAtlasCreditExhausted();
  if (creditExhausted && !prevHeartbeat?.creditExhausted) {
    console.warn('[swarm] state: ATLAS credit cooldown active — tier>1 routing degraded');
  } else if (!creditExhausted && prevHeartbeat?.creditExhausted) {
    console.info('[swarm] state: exiting ATLAS credit cooldown — tier>1 routing restored');
  }
  if (creditExhausted) {
    const downgraded = activated.filter((a) => a.tier > 1).map((a) => a.agentId);
    if (downgraded.length > 0) {
      console.warn(
        `[swarm] ATLAS credits exhausted (cooldown active) — ${downgraded.length} tier>1 agent(s) routed to Haiku: ${downgraded.join(', ')}`,
      );
    }
  }

  const tierGt1Cap = maxTierGt1PerRun();
  let tierGt1Scheduled = 0;
  const runQueue: { agentId: string; tier: number }[] = [];
  for (const entry of activated.sort((a, b) => b.tier - a.tier)) {
    if (entry.tier > 1) {
      if (tierGt1Scheduled >= tierGt1Cap) {
        skipped.push({ agentId: entry.agentId, reason: 'tier_gt1_cap_per_run' });
        continue;
      }
      tierGt1Scheduled += 1;
    }
    runQueue.push(entry);
  }

  for (const { agentId, tier } of runQueue) {
    // Re-check budget before each call (prior calls reduce it)
    if (!canAfford(currentBudget, tier)) {
      skipped.push({ agentId, reason: 'budget_depleted_mid_run' });
      continue;
    }

    const { result, durationMs, error } = await callAgent(
      client,
      agentId,
      tier,
      signals,
      busState,
      creditExhausted,
    );

    const entry: AgentBusEntry = {
      agentId,
      cycle,
      ranAt: Date.now(),
      tier,
      result,
      confidence: extractConfidence(result),
      durationMs,
      error,
    };

    await writeBusEntry(entry);
    results.push(entry);
    tiersUsed.push(tier);

    // Deduct from budget after each call
    currentBudget = await recordSpend([tierCostUsd(tier)]);

    if (error) {
      console.error(`[swarm] ${agentId} tier${tier} error: ${error}`);
    } else {
      log.info(`[swarm] ${agentId} tier${tier} ok in ${durationMs}ms (conf=${entry.confidence ?? '?'})`);
    }
  }

  const totalMs = Date.now() - runStart;
  const successCount = results.filter((r) => !r.error).length;

  // 4. Write swarm heartbeat
  // activatedCount = agents that actually ran (excludes budget_depleted_mid_run skips)
  // eligibleCount  = agents that passed activation conditions before the run
  await kvSetRawKey(SWARM_HEARTBEAT_KEY, {
    lastRun: Date.now(),
    cycle,
    creditExhausted,
    eligibleCount: activated.length,
    activatedCount: results.length,
    successCount,
    totalMs,
    gi: signals.gi,
    spentUsd: currentBudget.spentUsd,
  }, 3600);

  log.info(
    `[swarm] run complete @ ${cycle}: ${successCount}/${results.length} agents ok, ` +
    `$${currentBudget.spentUsd.toFixed(4)} spent, ${totalMs}ms total`,
  );

  return NextResponse.json({
    ok: true,
    cycle,
    signals,
    activated: activated.length,
    success: successCount,
    skipped: skipped.length,
    skippedAgents: skipped,
    tierBreakdown: tiersUsed.reduce<Record<string, number>>((acc, t) => {
      acc[`tier${t}`] = (acc[`tier${t}`] ?? 0) + 1;
      return acc;
    }, {}),
    budget: {
      spentUsd: currentBudget.spentUsd,
      remainingUsd: budgetRemaining(currentBudget),
      limitUsd: dailyLimitUsd(),
      callCount: currentBudget.callCount,
    },
    results: results.map((r) => ({
      agentId: r.agentId,
      tier: r.tier,
      confidence: r.confidence,
      durationMs: r.durationMs,
      error: r.error,
    })),
    totalMs,
  });
}
