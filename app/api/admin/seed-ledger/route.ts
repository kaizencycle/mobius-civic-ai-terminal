import { NextRequest, NextResponse } from 'next/server';
import { writeToSubstrate } from '@/lib/substrate/client';
import type { EpiconItem } from '@/lib/terminal/types';
import { getOperatorSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

type EchoFeedItem = {
  id: string;
  title: string;
  summary: string;
  status: 'pending' | 'verified' | 'contradicted';
  confidenceTier: number;
  ownerAgent: string;
  category: EpiconItem['category'];
  timestamp: string;
};

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (secret && bearer === secret) return true;
  const operator = await getOperatorSession();
  return Boolean(operator);
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const origin = request.nextUrl.origin;
  const echoRes = await fetch(`${origin}/api/echo/feed`, { cache: 'no-store' });
  if (!echoRes.ok) {
    return NextResponse.json({ ok: false, error: `echo_feed_http_${echoRes.status}` }, { status: 502 });
  }

  const payload = (await echoRes.json()) as { epicon?: EchoFeedItem[] };
  const epiconRows = Array.isArray(payload.epicon) ? payload.epicon : [];
  const committed = epiconRows.filter((row) => row.status === 'verified');

  const results = await Promise.all(
    committed.map((row) =>
      writeToSubstrate({
        id: `seed-${row.id}`,
        timestamp: row.timestamp,
        agent: row.ownerAgent,
        agentOrigin: row.ownerAgent.toUpperCase(),
        cycle: 'seed',
        title: row.title,
        summary: row.summary,
        category: row.category,
        severity: row.confidenceTier >= 3 ? 'critical' : row.confidenceTier >= 2 ? 'elevated' : 'nominal',
        source: 'seed-backfill',
        confidence: Math.max(0.2, Math.min(0.98, row.confidenceTier / 4)),
        tags: ['seed-backfill', row.category],
        verified: row.status === 'verified',
      }),
    ),
  );

  const attested = results.filter((result) => result.ok).length;
  const failed = results.length - attested;

  return NextResponse.json({ ok: true, attested, failed });
}
