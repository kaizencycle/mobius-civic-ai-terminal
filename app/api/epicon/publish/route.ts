import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();

  const record = {
    id: `EPICON-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    status: 'pending',
    title: body.title,
    summary: body.summary,
    sources: body.sources || [],
    tags: body.tags || [],
    confidence_tier: body.confidence >= 0.7 ? 2 : 1,
    publication_mode: body.publication_mode,
    mic_stake: body.publication_mode === 'public' ? body.mic_stake || 0 : 0,
    agents_used: body.agents_used || [],
    created_at: new Date().toISOString(),
    trace: [
      'Query result transformed into EPICON candidate',
      'Publication flow completed',
      'Awaiting ZEUS review / later settlement layer',
    ],
  };

  return NextResponse.json({
    ok: true,
    record,
  });
}
