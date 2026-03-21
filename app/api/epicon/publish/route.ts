import { NextRequest, NextResponse } from 'next/server';
import { addPublicEpicon } from '@/lib/epicon/feedStore';
import { requirePermission } from '@/lib/identity/guards';
import { lockStake } from '@/lib/mic/store';
import { incrementEpiconCount } from '@/lib/identity/store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const submitted_by_login = body.submitted_by_login || 'kaizencycle';

    if (body.publication_mode === 'public') {
      requirePermission(submitted_by_login, 'epicon:publish');
    }

    const record = {
      id: `EPICON-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      status: 'pending' as const,
      title: body.title,
      summary: body.summary,
      sources: body.sources || [],
      tags: body.tags || [],
      confidence_tier: body.confidence >= 0.7 ? 2 : 1,
      publication_mode: body.publication_mode,
      mic_stake: body.publication_mode === 'public' ? body.mic_stake || 0 : 0,
      agents_used: body.agents_used || [],
      submitted_by_login,
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

    if (record.publication_mode === 'public') {
      addPublicEpicon(record);

      if (record.submitted_by_login) {
        incrementEpiconCount(record.submitted_by_login);
      }
    }

    return NextResponse.json({
      ok: true,
      record,
      stake_lock,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to publish EPICON';
    const status = message.startsWith('Permission denied:') ? 403 : 400;

    return NextResponse.json(
      { ok: false, error: message },
      { status },
    );
  }
}
