/**
 * ZEUS Verification API Route
 *
 * POST /api/zeus/verify — Verify a submitted EPICON
 *
 * Flow:
 *   ZEUS (or custodian) reviews a pending EPICON
 *   → Outcome: hit (accurate) or miss (inaccurate/contradicted)
 *   → EPICON status updated (verified / contradicted)
 *   → Author profile stats updated (hits/misses)
 *   → MII recalculated
 *   → Node tier recalculated
 *
 * Principle: high MII = faster review priority, NOT automatic acceptance.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/identity/guards';
import {
  getStoredEpicon,
  updateEpicon,
  recordVerification,
} from '@/lib/mobius/stores';

export const dynamic = 'force-dynamic';

type VerifyRequest = {
  epiconId: string;
  outcome: 'hit' | 'miss';
  finalStatus: 'verified' | 'contradicted';
  finalConfidenceTier: number;
  zeusNote?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyRequest;
    const reviewer = ((body as VerifyRequest & { reviewer?: string }).reviewer) || 'kaizencycle';
    const permission = body.finalStatus === 'contradicted' || body.outcome === 'miss'
      ? 'epicon:contradict'
      : 'epicon:verify';

    if (!body.epiconId) {
      return NextResponse.json({ ok: false, error: 'epiconId is required' }, { status: 400 });
    }
    if (!body.outcome || !['hit', 'miss'].includes(body.outcome)) {
      return NextResponse.json({ ok: false, error: 'outcome must be "hit" or "miss"' }, { status: 400 });
    }
    if (!body.finalStatus || !['verified', 'contradicted'].includes(body.finalStatus)) {
      return NextResponse.json({ ok: false, error: 'finalStatus must be "verified" or "contradicted"' }, { status: 400 });
    }

    requirePermission(reviewer, permission);

    const epicon = getStoredEpicon(body.epiconId);
    if (!epicon) {
      return NextResponse.json({
        ok: false,
        error: `EPICON ${body.epiconId} not found in submission store`,
      }, { status: 404 });
    }

    // Prevent double-verification
    if (epicon.verificationOutcome) {
      return NextResponse.json({
        ok: false,
        error: `EPICON ${body.epiconId} already verified (outcome: ${epicon.verificationOutcome})`,
      }, { status: 409 });
    }

    const updatedEpicon = updateEpicon(body.epiconId, {
      status: body.finalStatus,
      confidenceTier: Math.max(0, Math.min(4, body.finalConfidenceTier ?? epicon.confidenceTier)),
      verificationOutcome: body.outcome,
      zeusNote: body.zeusNote || null,
      trace: [
        ...epicon.trace,
        `ZEUS verification: ${body.outcome} — status → ${body.finalStatus}, confidence → T${body.finalConfidenceTier}`,
        ...(body.zeusNote ? [`ZEUS note: ${body.zeusNote}`] : []),
      ],
    });

    let updatedProfile = null;
    if (epicon.submittedByLogin) {
      updatedProfile = recordVerification(epicon.submittedByLogin, body.outcome);
    }

    return NextResponse.json({
      ok: true,
      epiconId: body.epiconId,
      outcome: body.outcome,
      epicon: updatedEpicon,
      profile: updatedProfile
        ? {
            login: updatedProfile.login,
            miiScore: updatedProfile.miiScore,
            nodeTier: updatedProfile.nodeTier,
            verificationHits: updatedProfile.verificationHits,
            verificationMisses: updatedProfile.verificationMisses,
            epiconCount: updatedProfile.epiconCount,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    const status = message.startsWith('Permission denied:') ? 403 : 400;

    return NextResponse.json(
      { ok: false, error: message },
      { status },
    );
  }
}
