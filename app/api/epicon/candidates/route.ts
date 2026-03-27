import { createHash } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import {
  addPipelineCandidate,
  getPipelineCandidates,
  type EpiconCandidate,
  type EveSynthesisPayload,
} from '@/lib/eve/synthesis-pipeline-store';

export const dynamic = 'force-dynamic';

type CandidatePostBody = {
  cycleId?: string;
  synthesis?: EveSynthesisPayload;
};

function normalizeCycleSegment(cycleId: string): string {
  const trimmed = cycleId.trim();
  if (trimmed.toUpperCase().startsWith('C-')) {
    return trimmed.toUpperCase();
  }
  const digits = trimmed.replace(/[^0-9]/g, '');
  return `C-${digits.padStart(3, '0').slice(-3)}`;
}

function buildCandidateId(cycleId: string): string {
  const normalized = normalizeCycleSegment(cycleId);
  const stamp = `${normalized}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const hash = createHash('sha256').update(stamp).digest('hex').slice(0, 8);
  return `EPICON-${normalized}-EVE-SYN-${hash}`;
}

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CandidatePostBody;

    if (!body.synthesis || !isSynthesisPayload(body.synthesis)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid synthesis payload',
        },
        { status: 400 }
      );
    }

    const cycleId = body.cycleId ?? 'C-000';
    const timestamp = new Date().toISOString();
    const candidate: EpiconCandidate = {
      id: buildCandidateId(cycleId),
      cycleId,
      timestamp,
      source: 'eve-synthesis',
      status: 'pending-verification',
      title: body.synthesis.epiconTitle,
      summary: body.synthesis.epiconSummary,
      dominantTheme: body.synthesis.dominantTheme,
      dominantRegion: body.synthesis.dominantRegion,
      patternType: body.synthesis.patternType,
      confidenceTier: body.synthesis.confidenceTier,
      severity: body.synthesis.severity,
      flags: body.synthesis.flags,
      fullSynthesis: body.synthesis.synthesis,
      agentOrigin: 'EVE',
      verifiedBy: null,
      verifiedAt: null,
    };

    addPipelineCandidate(candidate);

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
