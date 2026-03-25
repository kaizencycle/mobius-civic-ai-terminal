import { NextResponse } from 'next/server';
import { getTreasuryComposition } from '@/lib/treasury/watch';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getTreasuryComposition();

    return NextResponse.json(
      {
        ok: true,
        ...payload,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
          'X-Mobius-Source': 'treasury-composition',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown Treasury composition error',
      },
      { status: 500 },
    );
  }
}
