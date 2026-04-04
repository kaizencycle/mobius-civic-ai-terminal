/**
 * GET /api/eve/governance-preview — public substrate-only EVE governance preview (no ledger write).
 * Use when external news is degraded so the EVE panel stays useful without automation auth.
 */

import { NextResponse } from 'next/server';

import {
  buildEveGovernanceSynthesisOutput,
  buildInternalPreviewFromInput,
  gatherEveGovernanceSynthesisInput,
} from '@/lib/eve/governance-synthesis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const input = await gatherEveGovernanceSynthesisInput();
  const output = buildEveGovernanceSynthesisOutput(input);
  const preview = buildInternalPreviewFromInput(input, output);

  return NextResponse.json(
    {
      ok: true,
      cycleId: input.cycleId,
      gatheredAt: input.gatheredAt,
      governancePosture: output.governancePosture,
      category: output.category,
      civicRiskLevel: output.civicRiskLevel,
      ethicsFlags: output.ethicsFlags,
      externalDegraded: input.externalDegraded,
      derivedFromCount: output.derivedFrom.length,
      ...preview,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'X-Mobius-Agent': 'EVE',
        'X-Mobius-Source': 'eve-governance-preview',
      },
    },
  );
}
