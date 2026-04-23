import { NextResponse } from 'next/server';
import { GET as getSignals } from '@/app/api/chambers/signals/route';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await getSignals();
    const payload = (await response.json()) as Record<string, unknown>;
    return NextResponse.json(
      {
        ...payload,
        ok: payload.ok === false ? false : true,
        degraded: payload.fallback === true,
        error: null,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        degraded: true,
        fallback: true,
        error: error instanceof Error ? error.message : 'signals_route_failed',
        families: [],
        anomalies: [],
        composite: null,
        last_sweep: null,
        raw: null,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
