/**
 * GET /api/integrity/perception
 *
 * C-369 read-only operator surface: GI perception manifest + Fountain federation state.
 * Does not mutate GI mathematics, MIC, or Fountain emission lanes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadIntegrityPerception } from '@/lib/mfs/assemble-perception';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const vaultLane = request.nextUrl.searchParams.get('vault_lane');
    const payload = await loadIntegrityPerception(vaultLane);
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'integrity-perception-c369',
      },
    });
  } catch (error) {
    console.error('[integrity/perception] error', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
