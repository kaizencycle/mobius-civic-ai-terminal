import { NextRequest, NextResponse } from 'next/server';
import { removePipelineCandidate } from '@/lib/eve/synthesis-pipeline-store';

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const removed = removePipelineCandidate(id);

  if (!removed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Candidate ${id} not found`,
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    removed: id,
  });
}
