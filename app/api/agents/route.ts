import { NextResponse } from 'next/server';
import { GET as getAgentStatus } from '@/app/api/agents/status/route';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await getAgentStatus();
    const payload = (await response.json()) as Record<string, unknown>;
    return NextResponse.json(
      {
        ...payload,
        ok: payload.ok === false ? false : true,
        degraded: payload.degraded === true || payload.fallback === true,
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
        error: error instanceof Error ? error.message : 'agents_route_failed',
        source: 'route-fallback',
        cycle: 'unknown',
        timestamp: new Date().toISOString(),
        agents: [],
      },
      { status: 200 },
    );
  }
}
