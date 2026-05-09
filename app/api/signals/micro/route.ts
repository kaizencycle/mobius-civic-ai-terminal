// C-306 FIX-511-03: Registry-driven signal sweep — 40 instruments, 6 agents, 60s KV cache.
// Replaces hardcoded 9-API sweep with fallback-aware registry (lib/signals).

import { NextResponse } from 'next/server';
import { SIGNAL_REGISTRY, AGENT_WEIGHTS } from '@/lib/signals/registry';
import { fetchAllInstruments, type InstrumentResult } from '@/lib/signals/fetcher';
import { kvGet, kvSet } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'signals:micro:cache';
const CACHE_TTL_MS = 60_000;
const CACHE_TTL_SEC = 90;

type CacheEntry = { data: SignalMicroPayload; cachedAt: number };

export type SignalMicroPayload = {
  ok: boolean;
  cached: boolean;
  gi: number;
  instrumentCount: number;
  agentCount: number;
  agents: AgentComposite[];
  instruments: InstrumentResult[];
  fallbacksUsed: number;
  errors: number;
  generatedAt: number;
  cycle: string;
};

type AgentComposite = {
  agent: string;
  score: number;
  errorCount: number;
  weight: number;
};

export async function GET() {
  // Serve from KV cache if fresh
  const cached = await kvGet<CacheEntry>(CACHE_KEY);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
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

  const agents: AgentComposite[] = Object.entries(agentAccum).map(
    ([agent, { score, weightSum, errorCount }]) => ({
      agent,
      score: parseFloat((weightSum > 0 ? score / weightSum : 0).toFixed(3)),
      errorCount,
      weight: AGENT_WEIGHTS[agent] ?? 0.1,
    }),
  );

  // Global integrity composite
  const gi = parseFloat(
    agents.reduce((acc, a) => acc + a.score * a.weight, 0).toFixed(3),
  );

  const data: SignalMicroPayload = {
    ok: true,
    cached: false,
    gi,
    instrumentCount: instruments.length,
    agentCount: agents.length,
    agents,
    instruments,
    fallbacksUsed: instruments.filter((i) => i.source === 'fallback').length,
    errors: instruments.filter((i) => i.source === 'error').length,
    generatedAt: Date.now(),
    cycle: process.env.CURRENT_CYCLE ?? 'C-306',
  };

  kvSet<CacheEntry>(CACHE_KEY, { data, cachedAt: Date.now() }, CACHE_TTL_SEC).catch(() => {});

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      'X-Signal-Cache': 'MISS',
      'X-Instrument-Count': String(instruments.length),
      'X-Mobius-Source': 'micro-registry-live',
    },
  });
}
