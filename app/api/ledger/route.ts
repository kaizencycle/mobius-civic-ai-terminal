import { NextResponse } from 'next/server';
import { GET as getLedger } from '@/app/api/chambers/ledger/route';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await getLedger();
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
        error: error instanceof Error ? error.message : 'ledger_route_failed',
        events: [],
        candidates: { pending: 0, confirmed: 0, contested: 0 },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
