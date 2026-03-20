import { NextResponse } from 'next/server';
import { getHeartbeat } from '@/lib/runtime/heartbeat';
import { getStalenessStatus } from '@/lib/runtime/staleness';
import { getTripwireState } from '@/lib/tripwire/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    tripwire: getTripwireState(),
    freshness: getStalenessStatus(getHeartbeat()),
  });
}
