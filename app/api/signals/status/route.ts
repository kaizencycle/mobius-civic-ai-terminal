import { NextResponse } from 'next/server';
import { loadSignalSnapshot, isRedisAvailable } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = await loadSignalSnapshot();
  if (!snapshot) {
    return NextResponse.json({
      ok: false,
      cached: false,
      kv: isRedisAvailable(),
      error: 'No signal snapshot in KV',
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    cached: true,
    kv: true,
    source: 'kv-snapshot',
    composite: snapshot.composite,
    anomalies: snapshot.anomalies,
    allSignals: snapshot.allSignals,
    timestamp: snapshot.timestamp,
    healthy: snapshot.healthy,
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      'X-Mobius-Source': 'signals-status-kv',
    },
  });
}
