import { NextRequest, NextResponse } from 'next/server';
import { attestToLedger } from '@/lib/substrate/client';
import type { EpiconItem } from '@/lib/terminal/types';
import { getOperatorSession } from '@/lib/auth/session';
import { currentCycleId } from '@/lib/eve/cycle-engine';

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

/** ECHO transform timestamps: `YYYY-MM-DD HH:MM UTC` */
function parseEchoFeedTimestampUtcMs(ts: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\s+UTC$/i.exec(ts.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
}

function isSameMobiusCycleDay(timestamp: string, ref: Date = new Date()): boolean {
  const ms = parseEchoFeedTimestampUtcMs(timestamp);
  if (ms === null) return false;
  const feedDay = new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const refDay = ref.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return feedDay === refDay;
}

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
  const cycleId = currentCycleId();
  const committed = epiconRows.filter(
    (row) => row.status === 'verified' && isSameMobiusCycleDay(row.timestamp),
  );

  const results = await Promise.all(
    committed.map((row) =>
      attestToLedger({
        id: `c274-seed-${row.id}`,
        timestamp: row.timestamp,
        agent: row.ownerAgent,
        agentOrigin: row.ownerAgent,
        cycle: cycleId,
        title: row.title,
        summary: row.summary,
        category: row.category,
        severity: row.confidenceTier >= 3 ? 'critical' : row.confidenceTier >= 2 ? 'elevated' : 'nominal',
        source: 'echo-ingest',
        confidence: Math.max(0.2, Math.min(0.98, row.confidenceTier / 4)),
        tags: ['c274-seed', 'echo-ingest', row.category],
        verified: true,
      }),
    ),
  );

  const attested = results.filter((result) => result.ok).length;
  const failed = results.length - attested;

  return NextResponse.json({ ok: true, attested, failed });
}
