import { NextResponse } from 'next/server';
import { getTreasuryWatchSnapshot } from '@/lib/treasury/watch';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await getTreasuryWatchSnapshot();

    return NextResponse.json(
      {
        ok: true,
        ...snapshot,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          'X-Mobius-Source': 'treasury-watch',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown Treasury watch error',
      },
      { status: 500 },
    );
  }
}
