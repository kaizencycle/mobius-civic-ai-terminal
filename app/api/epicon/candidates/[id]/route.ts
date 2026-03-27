import { NextResponse } from 'next/server';

import { removePipelineCandidate } from '@/lib/eve/synthesis-pipeline-store';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
  }

  const removed = removePipelineCandidate(decodeURIComponent(id));
  if (!removed) {
    return NextResponse.json({ ok: false, error: 'Candidate not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id });
}
