import { NextRequest, NextResponse } from 'next/server';

import { buildShardCandidate } from '@/lib/epicon/shards/buildCandidate';
import { listDiscoverableCycles } from '@/lib/epicon/shards/discover';
import { listShardProposals } from '@/lib/epicon/shards/store';
import { toPublicShardProposal } from '@/lib/epicon/shards/sanitize';

export const dynamic = 'force-dynamic';

type ProposeBody = {
  cycleId?: string;
};

export async function GET() {
  return NextResponse.json({
    ok: true,
    discoverableCycles: listDiscoverableCycles(),
    proposals: listShardProposals().map((proposal) => toPublicShardProposal(proposal)),
    count: listShardProposals().length,
    sealed: false,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProposeBody;
    const cycleId =
      typeof body.cycleId === 'string' && body.cycleId.trim() ? body.cycleId.trim() : '';

    if (!cycleId) {
      return NextResponse.json({ ok: false, error: 'cycleId is required' }, { status: 400 });
    }

    const proposal = buildShardCandidate({ cycleId });
    const payload = toPublicShardProposal(proposal);

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        sealed: false,
        error: error instanceof Error ? error.message : 'Unable to propose shard',
      },
      { status: 400 },
    );
  }
}
