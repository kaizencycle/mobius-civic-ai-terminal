import { NextRequest, NextResponse } from 'next/server';

import type { ReviewAgent, ReviewVerdict } from '@/lib/epicon/shards/compiler/types';
import { getShardProposal, updateShardReview } from '@/lib/epicon/shards/store';
import { toPublicShardProposal } from '@/lib/epicon/shards/sanitize';

export const dynamic = 'force-dynamic';

type ReviewBody = {
  agent?: string;
  verdict?: string;
};

const REVIEW_AGENTS: ReviewAgent[] = ['atlas', 'zeus', 'aurea', 'jade', 'human'];
const REVIEW_VERDICTS: ReviewVerdict[] = ['pending', 'pass', 'fail', 'clarify'];

function isReviewAgent(value: string): value is ReviewAgent {
  return REVIEW_AGENTS.includes(value as ReviewAgent);
}

function isReviewVerdict(value: string): value is ReviewVerdict {
  return REVIEW_VERDICTS.includes(value as ReviewVerdict);
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

    const existing = getShardProposal(decodeURIComponent(id));
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Shard proposal not found' }, { status: 404 });
    }

    const body = (await request.json()) as ReviewBody;
    const agent = typeof body.agent === 'string' ? body.agent.trim().toLowerCase() : '';
    const verdict = typeof body.verdict === 'string' ? body.verdict.trim().toLowerCase() : '';

    if (!isReviewAgent(agent)) {
      return NextResponse.json(
        { ok: false, error: 'agent must be one of atlas, zeus, aurea, jade, human' },
        { status: 400 },
      );
    }

    if (!isReviewVerdict(verdict)) {
      return NextResponse.json(
        { ok: false, error: 'verdict must be one of pending, pass, fail, clarify' },
        { status: 400 },
      );
    }

    const updated = updateShardReview(decodeURIComponent(id), agent, verdict);
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Shard proposal not found' }, { status: 404 });
    }

    return NextResponse.json(toPublicShardProposal(updated));
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        sealed: false,
        error: error instanceof Error ? error.message : 'Unable to record review',
      },
      { status: 400 },
    );
  }
}
