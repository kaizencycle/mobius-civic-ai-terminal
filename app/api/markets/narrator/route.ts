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
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown market narrator error',
      },
      { status: 500 },
    );
  }
}
