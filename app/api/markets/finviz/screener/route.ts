import { NextResponse } from 'next/server';
import { getFinvizScreener } from '@/lib/markets/finvizAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = await getFinvizScreener();

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=180',
      'X-Mobius-Source': payload.degraded ? 'finviz-screener-degraded' : 'finviz-screener',
    },
  });
}
