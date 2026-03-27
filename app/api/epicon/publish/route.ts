import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { addPublicEpicon } from '@/lib/epicon/feedStore';
import { requirePermission } from '@/lib/identity/guards';
import { lockStake } from '@/lib/mic/store';
import { incrementEpiconCount } from '@/lib/identity/store';
import {
  addPipelineFeedEntry,
  getPipelineCandidateById,
  removePipelineCandidate,
  type PublishedEpiconEntry,
} from '@/lib/eve/synthesis-pipeline-store';

const EPICON_FEED_LIST_KEY = 'mobius:epicon:feed';

type LegacyPublishBody = {
  submitted_by_login?: string;
  publication_mode?: 'public' | 'private_draft';
  title?: string;
  summary?: string;
  sources?: string[];
  tags?: string[];
  confidence?: number;
  mic_stake?: number;
  agents_used?: string[];
};

function toLegacyBody(input: Record<string, unknown>): LegacyPublishBody {
  return {
    submitted_by_login: typeof input.submitted_by_login === 'string' ? input.submitted_by_login : undefined,
    publication_mode:
      input.publication_mode === 'public' || input.publication_mode === 'private_draft'
        ? input.publication_mode
        : undefined,
    title: typeof input.title === 'string' ? input.title : undefined,
    summary: typeof input.summary === 'string' ? input.summary : undefined,
    sources: Array.isArray(input.sources) && input.sources.every((item) => typeof item === 'string')
      ? input.sources
      : undefined,
    tags: Array.isArray(input.tags) && input.tags.every((item) => typeof item === 'string')
      ? input.tags
      : undefined,
    confidence: typeof input.confidence === 'number' ? input.confidence : undefined,
    mic_stake: typeof input.mic_stake === 'number' ? input.mic_stake : undefined,
    agents_used: Array.isArray(input.agents_used) && input.agents_used.every((item) => typeof item === 'string')
      ? input.agents_used
      : undefined,
  };
}

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }

  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

function toSeverity(input: 'low' | 'medium' | 'high'): PublishedEpiconEntry['severity'] {
  if (input === 'high') return 'critical';
  if (input === 'medium') return 'elevated';
  return 'info';
}

async function publishSynthesisCandidate(candidateId: string) {
  const candidate = getPipelineCandidateById(candidateId);

  if (!candidate) {
    return NextResponse.json(
      {
        ok: false,
        error: `Candidate ${candidateId} not found`,
      },
      { status: 404 }
    );
  }

  if (candidate.status !== 'verified') {
    return NextResponse.json(
      {
        ok: false,
        error: `Candidate ${candidateId} must be verified before publish`,
      },
      { status: 400 }
    );
  }

  const entry: PublishedEpiconEntry = {
    id: candidate.id,
    timestamp: new Date().toISOString(),
    author: 'EVE',
    title: candidate.title,
    body: candidate.fullSynthesis,
    type: 'epicon',
    severity: toSeverity(candidate.severity),
    gi: null,
    tags: ['eve-synthesis', candidate.dominantTheme, candidate.patternType, 'automated'],
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

  const redis = getRedisClient();
  if (redis) {
    await redis.lpush(EPICON_FEED_LIST_KEY, JSON.stringify(entry));
    await redis.ltrim(EPICON_FEED_LIST_KEY, 0, 499);
  } else {
    addPipelineFeedEntry(entry);
  }

  removePipelineCandidate(candidate.id);

  return NextResponse.json({
    ok: true,
    published: entry,
    ledgerPosition: 0,
  });
}

async function publishLegacyRecord(rawBody: Record<string, unknown>) {
  const body = toLegacyBody(rawBody);
  const submitted_by_login = body.submitted_by_login ?? 'kaizencycle';

  if (body.publication_mode === 'public') {
    requirePermission(submitted_by_login, 'epicon:publish');
  }

  const record = {
    id: `EPICON-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    status: 'pending' as const,
    title: body.title ?? 'Untitled EPICON',
    summary: body.summary ?? '',
    sources: body.sources ?? [],
    tags: body.tags ?? [],
    confidence_tier: (body.confidence ?? 0) >= 0.7 ? 2 : 1,
    publication_mode: body.publication_mode ?? 'private_draft',
    mic_stake: body.publication_mode === 'public' ? body.mic_stake ?? 0 : 0,
    agents_used: body.agents_used ?? [],
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
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'POST { candidateId } to publish to ledger',
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { candidateId?: string };

    if (typeof body.candidateId === 'string' && body.candidateId.length > 0) {
      return publishSynthesisCandidate(body.candidateId);
    }

    // Fallback to legacy publish mode.
    return publishLegacyRecord(body as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to publish EPICON';
    const status = message.startsWith('Permission denied:') ? 403 : 400;

    return NextResponse.json(
      { ok: false, error: message },
      { status },
    );
  }
}
