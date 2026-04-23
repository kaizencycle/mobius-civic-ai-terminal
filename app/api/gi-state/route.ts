import { NextResponse } from 'next/server';
import { GET as getGlobe } from '@/app/api/chambers/globe/route';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await getGlobe();
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
        error: error instanceof Error ? error.message : 'gi_state_route_failed',
        cycle: 'C-—',
        micro: null,
        echo: { epicon: [] },
        sentiment: null,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
