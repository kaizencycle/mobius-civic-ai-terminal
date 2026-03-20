import { NextResponse } from 'next/server';
import { getHeartbeat } from '@/lib/runtime/heartbeat';
import { getStalenessStatus } from '@/lib/runtime/staleness';

export const dynamic = 'force-dynamic';

export async function GET() {
  const lastRun = getHeartbeat();
  const status = getStalenessStatus(lastRun);

  return NextResponse.json({
    ok: true,
    last_run: lastRun,
    freshness: status,
  });
}
