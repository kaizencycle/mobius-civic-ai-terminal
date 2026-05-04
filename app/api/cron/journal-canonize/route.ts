import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getJournalRedisClient } from '@/lib/agents/journalLane';
import { processJournalCanonOutbox } from '@/lib/agents/journalCanonOutbox';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { kvGet, kvSet, KV_KEYS } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RETRY_QUEUE_CAP = 100;

function clampLimit(input: string | null): number {
  const parsed = Number(input ?? '10');
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(50, Math.max(1, Math.floor(parsed)));
}

async function ensureRetryQueueExists(): Promise<void> {
  try {
    const existing = await kvGet<string[]>(KV_KEYS.SUBSTRATE_RETRY_QUEUE);
    if (existing === null) {
      await kvSet(KV_KEYS.SUBSTRATE_RETRY_QUEUE, []);
    }
  } catch {
    // diagnostic-only; never fail the main path
  }
}

export async function GET(request: NextRequest) {
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || '';
  const manuallyAuthed = bearerMatchesToken(authHeader, cronSecret);

  if (!cronHeader && !manuallyAuthed) {
    return NextResponse.json({ ok: false, error: 'Cron-only endpoint' }, { status: 403 });
  }

  const repoUrl = process.env.JOURNAL_CANON_SUBSTRATE_TARGET ?? process.env.SUBSTRATE_GITHUB_REPO ?? process.env.GITHUB_REPO_URL ?? '(not configured)';
  console.log('[journal-canonize] running', {
    substrate_target: repoUrl
  });

  // Ensure SUBSTRATE_RETRY_QUEUE key exists in KV (resolves D1 key-missing snapshot flag).
  void ensureRetryQueueExists();

  const redis = getJournalRedisClient();
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));

  try {
    const result = await processJournalCanonOutbox(redis, limit);

    if (result.failed > 0) {
      // Persist failed item count to retry queue for operator visibility.
      try {
        const existing = await kvGet<string[]>(KV_KEYS.SUBSTRATE_RETRY_QUEUE) ?? [];
        const marker = `failed-${new Date().toISOString()}`;
        const updated = [...existing, marker].slice(-RETRY_QUEUE_CAP);
        await kvSet(KV_KEYS.SUBSTRATE_RETRY_QUEUE, updated);
      } catch {
        // non-fatal
      }
    }

    return NextResponse.json(
      {
        ok: true,
        source: 'cron-journal-canonize',
        limit,
        ...result,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const is403 = errMsg.includes('403') || (err as { status?: number })?.status === 403;

    if (is403) {
      console.warn('[journal-canonize] 403 from GitHub substrate — queuing to SUBSTRATE_RETRY_QUEUE');
      try {
        const existing = await kvGet<string[]>(KV_KEYS.SUBSTRATE_RETRY_QUEUE) ?? [];
        const marker = `403-${new Date().toISOString()}`;
        const updated = [...existing, marker].slice(-RETRY_QUEUE_CAP);
        await kvSet(KV_KEYS.SUBSTRATE_RETRY_QUEUE, updated);
        console.warn('[journal-canonize] queued to SUBSTRATE_RETRY_QUEUE, count:', updated.length);
      } catch {
        // non-fatal
      }
      return NextResponse.json(
        {
          ok: true,
          source: 'cron-journal-canonize',
          status: 'queued',
          reason: '403_github',
          timestamp: new Date().toISOString(),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    console.error('[journal-canonize] failed:', errMsg);
    return NextResponse.json(
      { ok: false, error: errMsg, timestamp: new Date().toISOString() },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
