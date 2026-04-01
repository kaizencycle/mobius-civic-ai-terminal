export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/identity/guards';
import {
  getStoredEpicon,
  updateEpicon,
  recordVerification,
} from '@/lib/mobius/stores';
import { writeEpiconEntry } from '@/lib/epicon-writer';
import {
  getEveSynthesisCandidateById,
  updateEveSynthesisCandidate,
  type ZeusSynthesisVerdict,
} from '@/lib/epicon/eveSynthesisCandidates';
import {
  getPipelineCandidateById,
  updatePipelineCandidate,
  type EpiconCandidate,
} from '@/lib/eve/synthesis-pipeline-store';

type VerifyRequest = {
  epiconId: string;
  outcome: 'hit' | 'miss';
  finalStatus: 'verified' | 'contradicted';
  finalConfidenceTier: number;
  zeusNote?: string;
};

function zeusScoreForTier(tier: number): number {
  if (tier >= 3) return 0.95;
  if (tier >= 2) return 0.88;
  return 0.7;
}

function computeEveSynthesisVerdict(candidate: {
  confidenceTier: number;
  flags: string[];
  severity: string;
}): ZeusSynthesisVerdict {
  const { confidenceTier, flags, severity } = candidate;
  const flagCount = flags.length;

  if (severity === 'high' && flagCount > 0) return 'contested';
  if (confidenceTier === 1) return 'low-confidence';
  if (confidenceTier >= 2 && flagCount === 0) return 'confirmed';
  if (confidenceTier >= 2 && flagCount > 0) return 'flagged';
  return 'low-confidence';
}

function verifyEveSynthesisCandidateRecord(
  id: string,
  candidate: {
    confidenceTier: number;
    flags: string[];
    severity: string;
    status: string;
  },
): NextResponse {
  if (candidate.status !== 'pending-verification') {
    return NextResponse.json(
      { ok: false, error: 'Candidate is not pending verification' },
      { status: 400 },
    );
  }
  const verdict = computeEveSynthesisVerdict(candidate);
  const verifiedAt = new Date().toISOString();
  const zeusScore = zeusScoreForTier(candidate.confidenceTier);
  const nextStatus: EpiconCandidate['status'] = verdict === 'contested' ? 'contested' : 'verified';
  if (getEveSynthesisCandidateById(id)) {
    updateEveSynthesisCandidate(id, {
      status: nextStatus,
      verifiedBy: 'ZEUS',
      verifiedAt,
      zeusVerdict: verdict,
    });
  }
  const pipe = getPipelineCandidateById(id);
  if (pipe) {
    const patch: Partial<EpiconCandidate> = {
      status: nextStatus,
      verifiedBy: 'ZEUS',
      verifiedAt,
      zeusVerdict: verdict,
    };
    updatePipelineCandidate(id, patch);
  }
  return NextResponse.json({
    ok: true,
    candidateId: id,
    verdict,
    verifiedAt,
    zeusScore,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'POST { candidateId } to verify a candidate',
  });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const body = rawBody as VerifyRequest & { candidateId?: string; reviewer?: string };

    if (typeof body.candidateId === 'string' && body.candidateId.trim()) {
      const id = body.candidateId.trim();
      const eveCand = getEveSynthesisCandidateById(id);
      if (eveCand) {
        return verifyEveSynthesisCandidateRecord(id, eveCand);
      }
      const pipeCand = getPipelineCandidateById(id);
      if (pipeCand && pipeCand.source === 'eve-synthesis') {
        return verifyEveSynthesisCandidateRecord(id, pipeCand);
      }
      return NextResponse.json({ ok: false, error: 'EVE synthesis candidate not found' }, { status: 404 });
    }

    const legacyAuthError = getServiceAuthError(request);
    if (legacyAuthError) return legacyAuthError;

    const reviewer = body.reviewer || 'kaizencycle';
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

    const confirmed = body.outcome === 'hit' && body.finalStatus === 'verified';
    const reportRef = body.epiconId;

    writeEpiconEntry({
      type: 'zeus-verify',
      severity: 'nominal',
      title: `ZEUS: Verification ${confirmed ? 'confirmed' : 'flagged'} · ${reportRef}`,
      author: 'ZEUS',
      verified: true,
      verifiedBy: 'ZEUS',
      tags: ['zeus', 'verification', confirmed ? 'confirmed' : 'flagged'],
    }).catch(() => {});

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
