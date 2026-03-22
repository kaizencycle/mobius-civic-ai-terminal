// ============================================================================
// GET /api/signals/micro
// Runs all four micro sub-agents and returns aggregated signal data.
// C-258 · Micro Sub-Agent Scaffold
// CC0 Public Domain
// ============================================================================

import { NextResponse } from 'next/server';
import { pollAllMicroAgents } from '@/lib/agents/micro';

export const dynamic = 'force-dynamic';

// Simple in-memory cache to avoid hammering public APIs
let cached: { data: Awaited<ReturnType<typeof pollAllMicroAgents>>; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute

export async function GET() {
  const now = Date.now();

  // Return cache if fresh
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

    return NextResponse.json({
      ok: true,
      cached: false,
      ...result,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'X-Mobius-Source': 'micro-agents-live',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
