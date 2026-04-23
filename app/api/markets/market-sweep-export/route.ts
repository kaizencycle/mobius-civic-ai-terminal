import { NextResponse } from 'next/server';
import { getMarketSweepExport } from '@/lib/markets/market-sweep-export';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getMarketSweepExport();

    return NextResponse.json(
      {
        ok: true,
        ...payload,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=180',
          'X-Mobius-Source': 'market-sweep-export',
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown market sweep export error';
    const keyMissing = /api key|token|unauthorized|forbidden|401/i.test(message);

    return NextResponse.json(
      {
        ok: false,
        degraded: true,
        reason: keyMissing ? 'API key not configured' : 'Upstream market provider unavailable',
        source: 'mock',
        error: message,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
          'X-Mobius-Source': 'market-sweep-export-degraded',
        },
      },
    );
  }
}
