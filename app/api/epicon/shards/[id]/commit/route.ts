import { NextRequest, NextResponse } from 'next/server';

import { commitShardCandidate, ShardCommitError } from '@/lib/epicon/shards/commit-candidate';
import { getShardProposal, replaceShardProposal } from '@/lib/epicon/shards/store';
import { toPublicShardProposal } from '@/lib/epicon/shards/sanitize';
import { getServiceOrOperatorWithBreakerError } from '@/lib/security/mutatingRouteAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authError = await getServiceOrOperatorWithBreakerError(request);
    if (authError) return authError;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    }

    const proposal = getShardProposal(decodeURIComponent(id));
    if (!proposal) {
      return NextResponse.json({ ok: false, error: 'Shard proposal not found' }, { status: 404 });
    }

    const { proposal: committed, commit } = await commitShardCandidate(proposal);
    replaceShardProposal(committed);
    const payload = toPublicShardProposal(committed);

    return NextResponse.json({
      ...payload,
      commit,
    });
  } catch (error) {
    if (error instanceof ShardCommitError) {
      const status =
        error.code === 'already_committed' ? 409 : error.code === 'not_quorum_ready' ? 400 : 403;
      return NextResponse.json(
        {
          ok: false,
          sealed: false,
          error: error.message,
          code: error.code,
        },
        { status },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        sealed: false,
        error: error instanceof Error ? error.message : 'Unable to commit shard candidate',
      },
      { status: 400 },
    );
  }
}
