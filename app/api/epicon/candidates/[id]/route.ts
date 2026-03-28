import { NextResponse } from 'next/server';

import { removeEveSynthesisCandidate } from '@/lib/epicon/eveSynthesisCandidates';
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

  const decoded = decodeURIComponent(id);
  const removedEve = removeEveSynthesisCandidate(decoded);
  const removedPipe = removePipelineCandidate(decoded);
  if (!removedEve && !removedPipe) {
    return NextResponse.json({ ok: false, error: 'Candidate not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: decoded });
}
