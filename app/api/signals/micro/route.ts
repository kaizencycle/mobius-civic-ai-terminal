// C-306 FIX-511-03: Registry-driven signal sweep — 40 instruments, 6 agents, 60s KV cache.
// Replaces hardcoded 9-API sweep with fallback-aware registry (lib/signals).
// Backward-compat: emits `agents` as AgentResult[] + `allSignals` so existing consumers
// (chambers/signals buildFamilies, SignalsPageClient familyFromAgent) continue to work.

import { type NextRequest, NextResponse } from 'next/server';
import { SIGNAL_REGISTRY, AGENT_WEIGHTS } from '@/lib/signals/registry';
import { fetchAllInstruments, type InstrumentResult } from '@/lib/signals/fetcher';
import { kvGet, kvSet } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'signals:micro:cache:v2';
const CACHE_TTL_MS = 60_000;
const CACHE_TTL_SEC = 90;

type CacheEntry = { data: SignalMicroPayload; cachedAt: number };

// Legacy shape — kept so chambers/signals buildFamilies and SignalsPageClient don't break
type LegacySignalEntry = {
  agentName: string;
  source: string;
  value: number;
  label: string;
  severity: string;
  timestamp: string;
};

type LegacyAgentResult = {
  agentName: string;
  signals: LegacySignalEntry[];
  healthy: boolean;
  mode: string;
};

export type SignalMicroPayload = {
  ok: boolean;
  cached: boolean;
  // New registry-based fields
  gi: number;
  instrumentCount: number;
  agentCount: number;
  agentComposites: AgentComposite[];
  instruments: InstrumentResult[];
  fallbacksUsed: number;
  errors: number;
  /** C-337 OPT-1: names + reasons of errored instruments (GI-neutral diagnostic; makes the `errors` count actionable). */
  failedInstruments: { id: string; agent: string; error: string }[];
  generatedAt: number;
  cycle: string;
  // Legacy fields — preserved for backward compat with chambers/signals and SignalsPageClient
  composite: number;         // same as gi
  agents: LegacyAgentResult[];
  allSignals: LegacySignalEntry[];
  healthy: boolean;
  timestamp: string;
};

type AgentComposite = {
  agent: string;
  score: number;
  errorCount: number;
  weight: number;
};

function scoreToSeverity(score: number): string {
  if (score >= 0.75) return 'nominal';
  if (score >= 0.5) return 'watch';
  return 'elevated';
}

function buildLegacyAgents(
  instruments: InstrumentResult[],
): { agents: LegacyAgentResult[]; allSignals: LegacySignalEntry[] } {
  const byAgent = new Map<string, InstrumentResult[]>();
  for (const inst of instruments) {
    const group = byAgent.get(inst.agent) ?? [];
    group.push(inst);
    byAgent.set(inst.agent, group);
  }

  const now = new Date().toISOString();
  const allSignals: LegacySignalEntry[] = [];
  const agents: LegacyAgentResult[] = [];

  for (const [agentKey, insts] of byAgent) {
    const signals: LegacySignalEntry[] = insts.map((inst) => {
      const entry: LegacySignalEntry = {
        agentName: agentKey,
        source: inst.id,
        value: inst.score,
        label: inst.label,
        severity: scoreToSeverity(inst.score),
        timestamp: now,
      };
      allSignals.push(entry);
      return entry;
    });

    const healthy = signals.some((s) => s.severity === 'nominal');
    agents.push({ agentName: agentKey, signals, healthy, mode: 'registry' });
  }

  return { agents, allSignals };
}

const LITE_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
  'X-Mobius-Source': 'micro-lite',
} as const;

export async function GET(req: NextRequest) {
  const lite = new URL(req.url).searchParams.get('lite') === '1';

  // Serve from KV cache if fresh
  const cached = await kvGet<CacheEntry>(CACHE_KEY);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    if (lite) {
      const nonNominal = cached.data.allSignals.filter((s) => s.severity !== 'nominal');
      return NextResponse.json(
        {
          ok: true,
          composite: cached.data.composite,
          anomaly_count: nonNominal.length,
          anomalies: nonNominal.slice(0, 10).map((s) => ({ source: s.source, label: s.label, severity: s.severity })),
          healthy: cached.data.healthy,
        },
        { headers: LITE_CACHE_HEADERS },
      );
    }
    return NextResponse.json(
      { ...cached.data, cached: true },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'X-Signal-Cache': 'HIT',
          'X-Instrument-Count': String(cached.data.instrumentCount),
          'X-Mobius-Source': 'micro-registry-cached',
        },
      },
    );
  }

  // Fetch all 40 instruments with fallback chains, 8 concurrent
  const instruments = await fetchAllInstruments(SIGNAL_REGISTRY, 8);

  // Compute per-agent weighted composites
  const agentAccum: Record<string, { score: number; weightSum: number; errorCount: number }> = {};
  for (const result of instruments) {
    const inst = SIGNAL_REGISTRY.find((i) => i.id === result.id);
    const w = inst?.weight ?? 1;
    if (!agentAccum[result.agent]) {
      agentAccum[result.agent] = { score: 0, weightSum: 0, errorCount: 0 };
    }
    agentAccum[result.agent].score += result.score * w;
    agentAccum[result.agent].weightSum += w;
    if (result.source === 'error') agentAccum[result.agent].errorCount++;
  }

  const agentComposites: AgentComposite[] = Object.entries(agentAccum).map(
    ([agent, { score, weightSum, errorCount }]) => ({
      agent,
      score: parseFloat((weightSum > 0 ? score / weightSum : 0).toFixed(3)),
      errorCount,
      weight: AGENT_WEIGHTS[agent] ?? 0.1,
    }),
  );

  // Global integrity composite
  const gi = parseFloat(
    agentComposites.reduce((acc, a) => acc + a.score * a.weight, 0).toFixed(3),
  );

  // Build legacy-compatible agents + allSignals for existing consumers
  const { agents, allSignals } = buildLegacyAgents(instruments);

  const data: SignalMicroPayload = {
    ok: true,
    cached: false,
    gi,
    instrumentCount: instruments.length,
    agentCount: agentComposites.length,
    agentComposites,
    instruments,
    fallbacksUsed: instruments.filter((i) => i.source === 'fallback').length,
    errors: instruments.filter((i) => i.source === 'error').length,
    failedInstruments: instruments
      .filter((i) => i.source === 'error')
      .map((i) => ({ id: i.id, agent: i.agent, error: i.error ?? 'unknown' })),
    generatedAt: Date.now(),
    cycle: process.env.CURRENT_CYCLE ?? 'C-306',
    // Legacy compat
    composite: gi,
    agents,
    allSignals,
    healthy: agents.some((a) => a.healthy),
    timestamp: new Date().toISOString(),
  };

  kvSet<CacheEntry>(CACHE_KEY, { data, cachedAt: Date.now() }, CACHE_TTL_SEC).catch(() => {});

  if (lite) {
    const nonNominal = data.allSignals.filter((s) => s.severity !== 'nominal');
    return NextResponse.json(
      {
        ok: true,
        composite: data.composite,
        anomaly_count: nonNominal.length,
        anomalies: nonNominal.slice(0, 10).map((s) => ({ source: s.source, label: s.label, severity: s.severity })),
        healthy: data.healthy,
      },
      { headers: LITE_CACHE_HEADERS },
    );
  }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      'X-Signal-Cache': 'MISS',
      'X-Instrument-Count': String(instruments.length),
      'X-Mobius-Source': 'micro-registry-live',
    },
  });
}
