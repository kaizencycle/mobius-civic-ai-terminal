/**
 * POST /api/integrity/grade/requests/[id]/review
 *
 * Record sentinel or human review verdicts. C-369: no MIC recognition on approval.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  getIntegrityGradeRequest,
  setIntegrityGradeHumanReview,
  updateIntegrityGradeReview,
} from '@/lib/mfs/integrity-grade/store';
import { toPublicIntegrityGradeRequest } from '@/lib/mfs/integrity-grade/sanitize';
import type {
  GradeReviewAgent,
  GradeReviewVerdict,
  HumanReviewVerdict,
} from '@/lib/mfs/integrity-grade/types';
import { GRADE_REVIEW_AGENTS } from '@/lib/mfs/integrity-grade/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ReviewBody = {
  agent?: string;
  verdict?: string;
};

const SENTINEL_VERDICTS: GradeReviewVerdict[] = ['pending', 'pass', 'clarify', 'reject'];
const HUMAN_VERDICTS: HumanReviewVerdict[] = ['pending', 'approved', 'rejected', 'deferred'];

function isSentinelAgent(value: string): value is GradeReviewAgent {
  return GRADE_REVIEW_AGENTS.includes(value as GradeReviewAgent);
}

function isSentinelVerdict(value: string): value is GradeReviewVerdict {
  return SENTINEL_VERDICTS.includes(value as GradeReviewVerdict);
}

function isHumanVerdict(value: string): value is HumanReviewVerdict {
  return HUMAN_VERDICTS.includes(value as HumanReviewVerdict);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    }

    const requestId = decodeURIComponent(id);
    const existing = getIntegrityGradeRequest(requestId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Integrity Grade request not found' }, { status: 404 });
    }

    const body = (await request.json()) as ReviewBody;
    const agent = typeof body.agent === 'string' ? body.agent.trim().toLowerCase() : '';
    const verdict = typeof body.verdict === 'string' ? body.verdict.trim().toLowerCase() : '';

    if (!agent) {
      return NextResponse.json({ ok: false, error: 'agent is required' }, { status: 400 });
    }

    if (!verdict) {
      return NextResponse.json({ ok: false, error: 'verdict is required' }, { status: 400 });
    }

    let updated = existing;

    if (agent === 'human') {
      if (!isHumanVerdict(verdict)) {
        return NextResponse.json(
          { ok: false, error: 'human verdict must be one of pending, approved, rejected, deferred' },
          { status: 400 },
        );
      }
      const next = setIntegrityGradeHumanReview(requestId, verdict);
      if (!next) {
        return NextResponse.json({ ok: false, error: 'Integrity Grade request not found' }, { status: 404 });
      }
      updated = next;
    } else if (isSentinelAgent(agent)) {
      if (!isSentinelVerdict(verdict)) {
        return NextResponse.json(
          { ok: false, error: 'sentinel verdict must be one of pending, pass, clarify, reject' },
          { status: 400 },
        );
      }
      const next = updateIntegrityGradeReview(requestId, agent, verdict);
      if (!next) {
        return NextResponse.json({ ok: false, error: 'Integrity Grade request not found' }, { status: 404 });
      }
      updated = next;
    } else {
      return NextResponse.json(
        { ok: false, error: 'agent must be one of atlas, zeus, eve, jade, aurea, human' },
        { status: 400 },
      );
    }

    const payload = toPublicIntegrityGradeRequest(updated);
    if (payload.result && payload.result.status === 'RECOGNIZED') {
      return NextResponse.json(
        {
          ok: false,
          proposal_only: true,
          minting_enabled: false,
          error: 'RECOGNIZED status is not available in C-369 proposal-only path',
        },
        { status: 409 },
      );
    }

    if (payload.result && payload.result.recognition.mic > 0) {
      return NextResponse.json(
        {
          ok: false,
          proposal_only: true,
          minting_enabled: false,
          error: 'MIC recognition is not enabled in C-369',
        },
        { status: 409 },
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[integrity/grade/requests/review] error', error);
    return NextResponse.json(
      {
        ok: false,
        proposal_only: true,
        minting_enabled: false,
        error: error instanceof Error ? error.message : 'Unable to record review',
      },
      { status: 400 },
    );
  }
}
