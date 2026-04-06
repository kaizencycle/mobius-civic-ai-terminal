/**
 * GET /api/eve/synthesis-input — normalized EVE governance synthesis substrate (C-270).
 * Public read-only; no ledger writes. Safe for operators and automation preflight.
 */

import { NextResponse } from 'next/server';

import {
  buildNormalizedEveSynthesisInputSnapshot,
  gatherEveGovernanceSynthesisInput,
} from '@/lib/eve/governance-synthesis';
import { currentCycleId } from '@/lib/eve/cycle-engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const input = await gatherEveGovernanceSynthesisInput();
  const normalized = buildNormalizedEveSynthesisInputSnapshot(input);

  return NextResponse.json(
    {
      ok: true,
      currentCycle: currentCycleId(),
      input: normalized,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        'X-Mobius-Agent': 'EVE',
        'X-Mobius-Source': 'eve-synthesis-input',
      },
    },
  );
}
