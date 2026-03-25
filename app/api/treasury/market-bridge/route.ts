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
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown Treasury market bridge error',
      },
      { status: 500 },
    );
  }
}
