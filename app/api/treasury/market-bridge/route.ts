import { NextResponse } from 'next/server';
import { getTreasuryMarketBridge } from '@/lib/treasury/market-bridge';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getTreasuryMarketBridge();

    return NextResponse.json(
      {
        ok: true,
        ...payload,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
          'X-Mobius-Source': 'treasury-market-bridge',
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown Treasury market bridge error';
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
          'X-Mobius-Source': 'treasury-market-bridge-degraded',
        },
      },
    );
  }
}
