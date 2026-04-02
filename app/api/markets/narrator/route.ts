import { NextRequest, NextResponse } from 'next/server';
import { getMarketNarration } from '@/lib/markets/narrator';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agent = searchParams.get('agent') === 'hermes' ? 'hermes' : 'aurea';

    const payload = await getMarketNarration(agent);

    return NextResponse.json(
      {
        ok: true,
        ...payload,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=180',
          'X-Mobius-Source': 'market-narrator',
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown market narrator error';
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
          'X-Mobius-Source': 'market-narrator-degraded',
        },
      },
    );
  }
}
