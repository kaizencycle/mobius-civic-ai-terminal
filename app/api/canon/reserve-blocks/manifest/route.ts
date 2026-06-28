/**
 * GET /api/canon/reserve-blocks/manifest — proxy CPC .dat hash anchor manifest.
 * EPICON: C-357 | RESERVE_BLOCK_DAT_CANONIZATION
 */

import { NextResponse } from 'next/server';
import { fetchCpcManifest } from '@/lib/cpc/hashAnchor';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function GET() {
  const manifest = await fetchCpcManifest();

  if (!manifest) {
    return NextResponse.json(
      {
        ok: false,
        total_dat_files: 0,
        total_blocks_anchored: 0,
        total_mic_anchored: 0,
        chain_tip: null,
        chain_tip_hash: null,
        anchors: [],
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true, ...manifest });
}
