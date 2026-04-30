import { NextRequest, NextResponse } from 'next/server';
import type { LedgerEntry } from '@/lib/terminal/types';
import { detectConflictZones } from '@/lib/agents/conflict-zones';

async function fetchLedger(request: NextRequest): Promise<LedgerEntry[]> {
  const url = new URL('/api/chambers/ledger', request.nextUrl.origin);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('ledger fetch failed');
  const json = await res.json();
  return Array.isArray(json?.events) ? json.events : [];
}

export async function GET(request: NextRequest) {
  try {
    const entries = await fetchLedger(request);
    const zones = detectConflictZones(entries);

    return NextResponse.json({
      ok: true,
      version: 'C-296.phase10.conflict-zones.v1',
      count: zones.length,
      zones: zones.slice(0, 50),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}
