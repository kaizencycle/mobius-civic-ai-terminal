/**
 * MII Feed — GET /api/mii/feed
 *
 * Returns the last N MII state entries from the rolling mii:feed KV list (default 200, max 500).
 * Each entry is one agent's integrity score at a point in time.
 *
 * Query params:
 *   ?agent=ZEUS  — filter to a single agent (case-insensitive)
 *   ?limit=200   — max entries to return (default 200, cap 500)
 *
 * Response: { ok, count, entries, agents, timestamp }
 *
 * This endpoint reads scores only. No reasoning, no events, no observations.
 * Those belong in the Journal.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { readMiiFeed } from '@/lib/kv/mii';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const agentFilter = request.nextUrl.searchParams.get('agent');
  const limitRaw = request.nextUrl.searchParams.get('limit');
  const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : NaN;
  const limit = Number.isFinite(limitParsed) ? limitParsed : undefined;

  const entries = await readMiiFeed(agentFilter, limit);
  const agents = Array.from(new Set(entries.map((e) => e.agent)));

  return NextResponse.json(
    {
      ok: true,
      count: entries.length,
      entries,
      agents,
      timestamp: new Date().toISOString(),
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
