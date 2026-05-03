import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getJournalRedisClient } from '@/lib/agents/journalLane';
import { processJournalCanonOutbox } from '@/lib/agents/journalCanonOutbox';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function clampLimit(input: string | null): number {
  const parsed = Number(input ?? '10');
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(50, Math.max(1, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || '';
  const manuallyAuthed = bearerMatchesToken(authHeader, cronSecret);

  if (!cronHeader && !manuallyAuthed) {
    return NextResponse.json({ ok: false, error: 'Cron-only endpoint' }, { status: 403 });
  }

  const redis = getJournalRedisClient();
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
  const result = await processJournalCanonOutbox(redis, limit);

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
}

export async function POST(request: NextRequest) {
  return GET(request);
}
