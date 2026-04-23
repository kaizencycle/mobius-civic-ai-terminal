import { NextRequest, NextResponse } from 'next/server';
import {
  addPipelineCandidate,
  allocateEveSynthesisEpiconId,
  getPipelineCandidates,
  type EpiconCandidate,
  type EveSynthesisPayload,
} from '@/lib/eve/synthesis-pipeline-store';
import { addEveSynthesisCandidate } from '@/lib/epicon/eveSynthesisCandidates';

export const dynamic = 'force-dynamic';

type CandidatePostBody = {
  cycleId?: string;
  synthesis?: EveSynthesisPayload;
  ok?: boolean;
  agent?: string;
};

function isSynthesisPayload(value: unknown): value is EveSynthesisPayload {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.synthesis === 'string' &&
    typeof candidate.dominantTheme === 'string' &&
    typeof candidate.dominantRegion === 'string' &&
    typeof candidate.patternType === 'string' &&
    typeof candidate.epiconTitle === 'string' &&
    typeof candidate.epiconSummary === 'string' &&
    Array.isArray(candidate.flags) &&
    candidate.flags.every((flag) => typeof flag === 'string') &&
    (candidate.confidenceTier === 1 || candidate.confidenceTier === 2 || candidate.confidenceTier === 3) &&
    (candidate.severity === 'low' || candidate.severity === 'medium' || candidate.severity === 'high')
  );
}

export async function GET() {
  const candidates = getPipelineCandidates();
  return NextResponse.json({
    ok: true,
    candidates,
    count: candidates.length,
  });
}

function resolveSynthesisFromBody(body: CandidatePostBody): EveSynthesisPayload | null {
  if (body.synthesis && isSynthesisPayload(body.synthesis)) {
    return body.synthesis;
  }
  if (isSynthesisPayload(body)) {
    return body;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CandidatePostBody & Record<string, unknown>;

    const synthesisPayload = resolveSynthesisFromBody(body);
    if (!synthesisPayload) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid synthesis payload',
        },
        { status: 400 }
      );
    }

    const cycleId =
      typeof body.cycleId === 'string' && body.cycleId.trim()
        ? body.cycleId.trim()
        : 'C-000';
    const timestamp = new Date().toISOString();
    const candidate: EpiconCandidate = {
      id: allocateEveSynthesisEpiconId(cycleId),
      cycleId,
      timestamp,
      source: 'eve-synthesis',
      status: 'pending-verification',
      title: synthesisPayload.epiconTitle,
      summary: synthesisPayload.epiconSummary,
      dominantTheme: synthesisPayload.dominantTheme,
      dominantRegion: synthesisPayload.dominantRegion,
      patternType: synthesisPayload.patternType,
      confidenceTier: synthesisPayload.confidenceTier,
      severity: synthesisPayload.severity,
      flags: synthesisPayload.flags,
      fullSynthesis: synthesisPayload.synthesis,
      agentOrigin: 'EVE',
      verifiedBy: null,
      verifiedAt: null,
    };

    addPipelineCandidate(candidate);
    addEveSynthesisCandidate(candidate);

    return NextResponse.json({
      ok: true,
      candidate,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to store candidate',
      },
      { status: 400 }
    );
  }
}
