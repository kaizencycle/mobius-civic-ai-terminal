import { NextRequest, NextResponse } from 'next/server';
import { getJournalRedisClient } from '@/lib/agents/journalLane';
import { processJournalCanonOutbox } from '@/lib/agents/journalCanonOutbox';
import { getServiceAuthError } from '@/lib/security/serviceAuth';
import { getOperatorSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function clampLimit(input: string | null): number {
  const parsed = Number(input ?? '5');
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.min(25, Math.max(1, Math.floor(parsed)));
}

async function run(request: NextRequest) {
  const redis = getJournalRedisClient();
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
  const result = await processJournalCanonOutbox(redis, limit);
  return NextResponse.json(
    {
      ok: true,
      ...result,
      limit,
      timestamp: new Date().toISOString(),
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  const authError = getServiceAuthError(request);
  const operator = await getOperatorSession();
  if (authError && !operator) return authError;
  return run(request);
}
