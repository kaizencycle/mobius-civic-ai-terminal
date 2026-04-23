import { NextRequest, NextResponse } from 'next/server';
import { getTreasuryHistory, type TreasuryHistorySeries, type TreasuryHistoryWindow } from '@/lib/treasury/watch';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const window = (searchParams.get('window') ?? '30d') as TreasuryHistoryWindow;
    const series = (searchParams.get('series') ?? 'velocity') as TreasuryHistorySeries;

    const payload = await getTreasuryHistory(window, series);

    return NextResponse.json(
      {
        ok: true,
        ...payload,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
          'X-Mobius-Source': 'treasury-history',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown Treasury history error',
      },
      {
        status: 500,
      },
    );
  }
}
