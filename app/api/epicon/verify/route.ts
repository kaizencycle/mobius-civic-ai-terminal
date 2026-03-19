import { NextRequest, NextResponse } from 'next/server';
import { verifyCandidate } from '@/lib/epicon/store';

export async function POST(req: NextRequest) {
  const body = await req.json();

  const updated = verifyCandidate({
    id: body.id,
    outcome: body.outcome,
    confidence_tier: body.confidence_tier,
    zeus_note: body.zeus_note,
  });

  if (!updated) {
    return NextResponse.json(
      { ok: false, error: 'Candidate not found' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    candidate: updated,
  });
}
