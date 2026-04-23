import { NextResponse } from 'next/server';
import { getMacroIntegrityPulse } from '@/lib/markets/macro-integrity';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getMacroIntegrityPulse();

    return NextResponse.json(
      {
        ok: true,
        ...payload,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=180',
          'X-Mobius-Source': 'macro-integrity-pulse',
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
            : 'Unknown macro integrity pulse error',
      },
      { status: 500 },
    );
  }
}
