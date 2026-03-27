import { NextRequest, NextResponse } from 'next/server';
import {
  getPipelineCandidateById,
  updatePipelineCandidate,
} from '@/lib/eve/synthesis-pipeline-store';

export const dynamic = 'force-dynamic';

type VerifyBody = {
  candidateId?: string;
};

type ZeusVerdict = 'confirmed' | 'flagged' | 'low-confidence' | 'contested';

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
