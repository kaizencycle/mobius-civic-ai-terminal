/**
 * MII Feed — GET /api/mii/feed
 *
 * Returns the last 100 MII state entries from the rolling mii:feed KV list.
 * Each entry is one agent's integrity score at a point in time.
 *
 * Query params:
 *   ?agent=ZEUS  — filter to a single agent (case-insensitive)
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

  const entries = await readMiiFeed(agentFilter);
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
