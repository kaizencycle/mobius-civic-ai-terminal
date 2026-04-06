import { NextResponse } from 'next/server';
import { getFinvizSignals } from '@/lib/markets/finvizAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = await getFinvizSignals();

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      'X-Mobius-Source': payload.degraded ? 'finviz-signals-degraded' : 'finviz-signals',
    },
  });
}
