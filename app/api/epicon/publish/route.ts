import { NextRequest, NextResponse } from 'next/server';
import { addPublicEpicon } from '@/lib/epicon/feedStore';
import { getEveSynthesisCandidateById, removeEveSynthesisCandidate } from '@/lib/epicon/eveSynthesisCandidates';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import type { EpiconLedgerFeedEntry } from '@/lib/epicon/ledgerFeedTypes';
import { requirePermission } from '@/lib/identity/guards';
import { lockStake } from '@/lib/mic/store';
import { incrementEpiconCount } from '@/lib/identity/store';

export const dynamic = 'force-dynamic';

function mapEveSeverity(
  s: string,
): EpiconLedgerFeedEntry['severity'] {
  if (s === 'low') return 'info';
  if (s === 'medium') return 'elevated';
  if (s === 'high') return 'critical';
  return 'info';
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'POST { candidateId } to publish to ledger',
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (typeof body.candidateId === 'string' && body.candidateId.trim()) {
      const candidate = getEveSynthesisCandidateById(body.candidateId.trim());
      if (!candidate) {
        return NextResponse.json({ ok: false, error: 'Candidate not found' }, { status: 404 });
      }
      if (candidate.status !== 'verified') {
        return NextResponse.json(
          { ok: false, error: 'Candidate must be verified before publish' },
          { status: 400 },
        );
      }

      const entry: EpiconLedgerFeedEntry = {
        id: candidate.id,
        timestamp: new Date().toISOString(),
        author: 'EVE',
        title: candidate.title,
        body: candidate.fullSynthesis,
        type: 'epicon',
        severity: mapEveSeverity(candidate.severity),
        gi: null,
        tags: [
          'eve-synthesis',
          candidate.dominantTheme,
          candidate.patternType,
          'automated',
        ],
        source: 'eve-synthesis',
        verified: true,
        verifiedBy: 'ZEUS',
        cycle: candidate.cycleId,
        category: candidate.dominantTheme,
        confidenceTier: candidate.confidenceTier,
        zeusVerdict: candidate.zeusVerdict,
        patternType: candidate.patternType,
        dominantRegion: candidate.dominantRegion,
      };

      const { ledgerPosition } = await pushLedgerEntry(entry);
      removeEveSynthesisCandidate(candidate.id);

      return NextResponse.json({
        ok: true,
        published: entry,
        ledgerPosition,
      });
    }

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
