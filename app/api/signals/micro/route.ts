// ============================================================================
// GET /api/signals/micro
// Runs all four micro sub-agents and returns aggregated signal data.
// C-261 · KV persistence for cold-start recovery
// CC0 Public Domain
// ============================================================================

import { NextResponse } from 'next/server';
import { pollAllMicroAgents } from '@/lib/agents/micro';
import { saveSignalSnapshot, loadSignalSnapshot, isRedisAvailable } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

// Simple in-memory cache to avoid hammering public APIs
let cached: { data: Awaited<ReturnType<typeof pollAllMicroAgents>>; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute

export async function GET() {
  const now = Date.now();

  // Return in-memory cache if fresh
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      ok: true,
      cached: true,
      ...cached.data,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'X-Mobius-Source': 'micro-agents-cached',
      },
    });
  }

  try {
    const result = await pollAllMicroAgents();
    cached = { data: result, timestamp: now };

    // Persist signal snapshot to Redis for cold-start recovery
    if (isRedisAvailable()) {
      saveSignalSnapshot({
        composite: result.composite,
        anomalies: result.anomalies?.length ?? 0,
        allSignals: (result.allSignals ?? []).map((s: { agentName: string; source: string; value: number; label: string; severity: string }) => ({
          agentName: s.agentName,
          source: s.source,
          value: s.value,
          label: s.label,
          severity: s.severity,
        })),
        timestamp: result.timestamp,
        healthy: result.healthy,
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      cached: false,
      kv: isRedisAvailable(),
      ...result,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'X-Mobius-Source': 'micro-agents-live',
      },
    });
  } catch (err) {
    // On failure, try to serve last-known state from Redis
    if (isRedisAvailable()) {
      const snapshot = await loadSignalSnapshot();
      if (snapshot) {
        return NextResponse.json({
          ok: true,
          cached: true,
          source: 'kv-fallback',
          composite: snapshot.composite,
          anomalies: snapshot.allSignals.filter((s) => s.severity === 'elevated' || s.severity === 'critical'),
          allSignals: snapshot.allSignals,
          timestamp: snapshot.timestamp,
          healthy: snapshot.healthy,
        }, {
          headers: {
            'X-Mobius-Source': 'micro-agents-kv-fallback',
          },
        });
      }
    }

    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
