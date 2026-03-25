import { NextResponse } from 'next/server';
import { getTreasuryAlerts } from '@/lib/treasury/alerts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getTreasuryAlerts();

    return NextResponse.json(
      {
        ok: true,
        ...payload,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
          'X-Mobius-Source': 'treasury-alert-engine',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown Treasury alert engine error',
      },
      { status: 500 },
    );
  }
}
