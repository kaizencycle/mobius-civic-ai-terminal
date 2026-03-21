import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/identity/guards';
import { verifyCandidate } from '@/lib/epicon/store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const reviewer = body.reviewer || 'kaizencycle';
    const permission = body.outcome === 'contradicted' ? 'epicon:contradict' : 'epicon:verify';

    requirePermission(reviewer, permission);

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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify candidate';
    const status = message.startsWith('Permission denied:') ? 403 : 400;

    return NextResponse.json(
      { ok: false, error: message },
      { status },
    );
  }
}
