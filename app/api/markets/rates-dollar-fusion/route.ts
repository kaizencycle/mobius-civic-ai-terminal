import { NextResponse } from 'next/server';
import { getRatesDollarFusion } from '@/lib/markets/rates-dollar-fusion';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getRatesDollarFusion();

    return NextResponse.json(
      {
        ok: true,
        ...payload,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
          'X-Mobius-Source': 'rates-dollar-fusion',
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
            : 'Unknown rates-dollar fusion error',
      },
      { status: 500 },
    );
  }
}
