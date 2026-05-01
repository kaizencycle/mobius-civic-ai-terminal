import { NextRequest, NextResponse } from 'next/server';
import { GET as getSignals } from '@/app/api/chambers/signals/route';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const response = await getSignals(request);
    const payload = (await response.json()) as Record<string, unknown>;
    return NextResponse.json(
      {
        ...payload,
        ok: payload.ok === false ? false : true,
        degraded: payload.fallback === true,
        error: null,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
          'X-Mobius-Source': 'signals-proxy',
        },
      },
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
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
          'X-Mobius-Source': 'signals-proxy-fallback',
        },
      },
    );
  }
}
