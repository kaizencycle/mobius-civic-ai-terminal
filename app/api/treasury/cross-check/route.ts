import { NextResponse } from 'next/server';
import { getTreasuryCrossCheck } from '@/lib/treasury/cross-check';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getTreasuryCrossCheck();

    return NextResponse.json(
      {
        ok: true,
        ...payload,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
          'X-Mobius-Source': 'treasury-cross-check',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown Treasury cross-check error',
      },
      { status: 500 },
    );
  }
}
