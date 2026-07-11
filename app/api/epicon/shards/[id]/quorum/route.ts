import { NextResponse } from 'next/server';

import {
  buildShardQuorumDecision,
  buildShardQuorumPacket,
} from '@/lib/epicon/shards/build-shard-quorum-packet';
import { evaluateShardQuorum } from '@/lib/epicon/shards/quorum-gate';
import { getShardProposal } from '@/lib/epicon/shards/store';
import { toPublicShardProposal } from '@/lib/epicon/shards/sanitize';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
  }

  const proposal = getShardProposal(decodeURIComponent(id));
  if (!proposal) {
    return NextResponse.json({ ok: false, error: 'Shard proposal not found' }, { status: 404 });
  }

  const evaluation = evaluateShardQuorum(proposal);
  const packet = buildShardQuorumPacket(proposal);
  const decision = buildShardQuorumDecision(packet, proposal);
  const publicProposal = toPublicShardProposal(proposal);

  return NextResponse.json({
    ok: true,
    sealed: false,
    evaluation,
    packet,
    decision,
    proposal: publicProposal.proposal,
    document: publicProposal.document,
  });
}
