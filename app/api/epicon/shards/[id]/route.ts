import { NextResponse } from 'next/server';

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

  return NextResponse.json(toPublicShardProposal(proposal));
}
