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
  ok?: boolean;
  agent?: string;
};

function normalizeCycleSegment(cycleId: string): string {
  const trimmed = cycleId.trim();
  if (trimmed.toUpperCase().startsWith('C-')) {
    return trimmed.toUpperCase();
  }
  const digits = trimmed.replace(/[^0-9]/g, '');
  return `C-${digits.padStart(3, '0').slice(-3)}`;
}

/** EPICON-[C-NNN]-EVE-SYN-<hash> — hash from cycle + ISO timestamp (C-626). */
function buildCandidateId(cycleId: string, timestampIso: string): string {
  const normalized = normalizeCycleSegment(cycleId);
  const hash = createHash('sha256')
    .update(`${normalized}:${timestampIso}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
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
      id: buildCandidateId(cycleId, timestamp),
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
