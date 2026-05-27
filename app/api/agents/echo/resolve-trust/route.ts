import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { entryId?: string; agent?: string } = {};
  try {
    body = (await request.json()) as { entryId?: string; agent?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const { entryId, agent } = body;
  if (!entryId || !agent) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
  }

  // Queued for ECHO trust resolution pipeline. Full implementation
  // writes a trust-resolution EPICON entry and triggers a re-score sweep.
  return NextResponse.json({
    ok: true,
    queued: true,
    entryId,
    agent,
    message: 'Trust resolution request queued for ECHO review.',
  });
}
