/**
 * POST /api/eve/escalation-synthesize — C-270 escalation-only EVE governance synthesis.
 * Publishes when tripwire / GI / civic / treasury / narrative cluster thresholds fire; idempotent per signature.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { runEveGovernanceSynthesis } from '@/lib/eve/governance-synthesis';

export const dynamic = 'force-dynamic';

function authOk(request: NextRequest): boolean {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret || !secret.trim()) return true;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'POST to run escalation-gated EVE synthesis when substrate signals warrant an extra ledger entry',
  });
}

export async function POST(request: NextRequest) {
  if (!authOk(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runEveGovernanceSynthesis({ mode: 'escalation' });

  return NextResponse.json({
    ok: true,
    cycleId: result.cycleId,
    mode: 'escalation' as const,
    published: result.published,
    entryId: result.entryId,
    reason: result.reason,
    derivedFromCount: result.derivedFromCount,
    trace: {
      governancePosture: result.synthesis?.governancePosture ?? null,
      civicRiskLevel: result.synthesis?.civicRiskLevel ?? null,
      escalationActive:
        result.reason === 'no_escalation_conditions'
          ? false
          : result.reason === 'already_synthesized_for_escalation_signature'
            ? true
            : result.published,
    },
  });
}
