import { NextResponse } from 'next/server';
import { getTreasuryDeepComposition } from '@/lib/treasury/deep-composition';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getTreasuryDeepComposition();

    return NextResponse.json(
      {
        ok: true,
        ...payload,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
          'X-Mobius-Source': 'treasury-deep-composition',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown Treasury deep composition error',
      },
      {
        status: 500,
      },
    );
  }
}
