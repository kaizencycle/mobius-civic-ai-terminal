// ============================================================================
// GET /api/signals/micro
// Runs all micro-instruments (sensor federation sweep) and returns aggregated signal data.
// C-261 · KV persistence for cold-start recovery
// C-287 · Shared pipeline with /api/cron/sweep (10m) — in-memory cache 60s
// CC0 Public Domain
// ============================================================================

import { NextResponse } from 'next/server';
import { pollAllMicroAgents } from '@/lib/agents/micro';
import { loadSignalSnapshot, isRedisAvailable } from '@/lib/kv/store';
import { runMicroSweepPipeline } from '@/lib/signals/runMicroSweep';

export const dynamic = 'force-dynamic';

let cached: { data: Awaited<ReturnType<typeof pollAllMicroAgents>>; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function GET() {
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(
      {
        ok: true,
        cached: true,
        ...cached.data,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'X-Mobius-Source': 'micro-agents-cached',
        },
      },
    );
  }

  try {
    const result = await runMicroSweepPipeline(now);
    cached = { data: result, timestamp: now };

    const degradedInstruments = result.allSignals
      .filter((s) => s.severity === 'elevated' || s.severity === 'critical')
      .map((s) => ({ agentName: s.agentName, source: s.source, severity: s.severity, label: s.label }));

    return NextResponse.json(
      {
        ok: true,
        cached: false,
        kv: isRedisAvailable(),
        degraded_instruments: degradedInstruments,
        ...result,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'X-Mobius-Source': 'micro-agents-live',
        },
      },
    );
  } catch (err) {
    if (isRedisAvailable()) {
      const snapshot = await loadSignalSnapshot();
      if (snapshot) {
        const degradedInstruments = snapshot.allSignals
          .filter((s) => s.severity === 'elevated' || s.severity === 'critical')
          .map((s) => ({ agentName: s.agentName, source: s.source, severity: s.severity, label: s.label }));
        return NextResponse.json(
          {
            ok: true,
            cached: true,
            source: 'kv-fallback',
            composite: snapshot.composite,
            anomalies: snapshot.allSignals.filter((s) => s.severity === 'elevated' || s.severity === 'critical'),
            allSignals: snapshot.allSignals,
            timestamp: snapshot.timestamp,
            healthy: snapshot.healthy,
            degraded_instruments: degradedInstruments,
          },
          {
            headers: {
              'X-Mobius-Source': 'micro-agents-kv-fallback',
            },
          },
        );
      }
    }

    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
