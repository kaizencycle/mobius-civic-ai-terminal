import { NextRequest, NextResponse } from 'next/server';
import { lockStake } from '@/lib/mic/store';

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
    submitted_by_login: body.submitted_by_login || 'anonymous',
    created_at: new Date().toISOString(),
    trace: [
      'Query result transformed into EPICON candidate',
      'Publication flow completed',
      'Awaiting ZEUS review / later settlement layer',
    ],
  };

  let stake_lock = null;

  if (record.publication_mode === 'public' && record.mic_stake > 0) {
    stake_lock = lockStake({
      epicon_id: record.id,
      login: record.submitted_by_login,
      stake: record.mic_stake,
    });
  }

  return NextResponse.json({
    ok: true,
    record,
    stake_lock,
  });
}
