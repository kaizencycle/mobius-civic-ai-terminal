import { NextResponse } from 'next/server';
import { getCanonicalMacroOverlay } from '@/lib/markets/macro-overlay';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getCanonicalMacroOverlay();

    return NextResponse.json(
      {
        ok: true,
        ...payload,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=180',
          'X-Mobius-Source': 'macro-overlay-adapter',
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
            : 'Unknown macro overlay adapter error',
      },
      { status: 500 },
    );
  }
}
