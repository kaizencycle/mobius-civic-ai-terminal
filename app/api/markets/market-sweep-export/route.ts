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
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown market sweep export error',
      },
      { status: 500 },
    );
  }
}
