import { NextRequest, NextResponse } from 'next/server';
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

export const dynamic = 'force-dynamic';

type VerifyBody = {
  candidateId?: string;
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

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'POST { candidateId } to verify a candidate',
  });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body = rawBody as VerifyRequest & { candidateId?: string };

    if (typeof body.candidateId === 'string' && body.candidateId.trim()) {
      const id = body.candidateId.trim();
      const eveCand = getEveSynthesisCandidateById(id);
      if (!eveCand) {
        return NextResponse.json({ ok: false, error: 'EVE synthesis candidate not found' }, { status: 404 });
      }
      if (eveCand.status !== 'pending-verification') {
        return NextResponse.json(
          { ok: false, error: 'Candidate is not pending verification' },
          { status: 400 },
        );
      }
      const verdict = computeEveSynthesisVerdict(eveCand);
      const verifiedAt = new Date().toISOString();
      const zeusScore = zeusScoreForTier(eveCand.confidenceTier);
      updateEveSynthesisCandidate(id, {
        status: 'verified',
        verifiedBy: 'ZEUS',
        verifiedAt,
        zeusVerdict: verdict,
      });
      return NextResponse.json({
        ok: true,
        candidateId: id,
        verdict,
        verifiedAt,
        zeusScore,
      });
    }
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

function toZeusScore(confidenceTier: 1 | 2 | 3): number {
  if (confidenceTier === 1) return 0.7;
  if (confidenceTier === 2) return 0.88;
  return 0.95;
}

function evaluateVerdict(input: {
  confidenceTier: 1 | 2 | 3;
  flags: string[];
  severity: 'low' | 'medium' | 'high';
}): ZeusVerdict {
  if (input.severity === 'high' && input.flags.length > 0) {
    return 'contested';
  }

  if (input.confidenceTier >= 2 && input.flags.length === 0) {
    return 'confirmed';
  }

  if (input.confidenceTier >= 2 && input.flags.length > 0) {
    return 'flagged';
  }

  return 'low-confidence';
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'POST { candidateId } to verify a candidate',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VerifyBody;

    if (!body.candidateId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'candidateId is required',
        },
        { status: 400 }
      );
    }

    const candidate = getPipelineCandidateById(body.candidateId);

    if (!candidate) {
      return NextResponse.json(
        {
          ok: false,
          error: `Candidate ${body.candidateId} not found`,
        },
        { status: 404 }
      );
    }

    const verdict = evaluateVerdict({
      confidenceTier: candidate.confidenceTier,
      flags: candidate.flags,
      severity: candidate.severity,
    });

    const verifiedAt = new Date().toISOString();

    updatePipelineCandidate(candidate.id, {
      status: 'verified',
      verifiedBy: 'ZEUS',
      verifiedAt,
      zeusVerdict: verdict,
    });

    return NextResponse.json({
      ok: true,
      candidateId: candidate.id,
      verdict,
      verifiedAt,
      zeusScore: toZeusScore(candidate.confidenceTier),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to verify candidate',
      },
      { status: 400 }
    );
  }
}
