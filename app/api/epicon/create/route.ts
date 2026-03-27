/**
 * EPICON Create API Route
 *
 * POST /api/epicon/create — User EPICON submission (terminal) or KV ledger write (Bearer BACKFILL_SECRET)
 * GET  /api/epicon/create — Last 20 entries from KV epicon feed (same source as /api/epicon/feed)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEchoStatus } from '@/lib/echo/store';
import {
  storeEpicon,
  incrementEpiconCount,
  type StoredEpicon,
} from '@/lib/mobius/stores';
import {
  parseEpiconWritePayload,
  readEpiconFeedEntries,
  writeEpiconEntry,
} from '@/lib/epicon-writer';

export const dynamic = 'force-dynamic';

function isLedgerAuthorized(request: NextRequest): boolean {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

let submissionCounter = 0;

function generateEpiconId(): string {
  const { cycleId } = getEchoStatus();
  submissionCounter += 1;
  const idx = String(submissionCounter).padStart(3, '0');
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  return `EPICON-${cycleId}-USR-${idx}-${ts}`;
}

type CreateRequest = {
  title: string;
  summary: string;
  category: string;
  sources: string[];
  tags: string[];
  confidenceTier: number;
  submittedBy?: string;
  submittedByLogin?: string;
};

export async function POST(request: NextRequest) {
  try {
    if (isLedgerAuthorized(request)) {
      const raw: unknown = await request.json();
      const parsed = parseEpiconWritePayload(raw);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
      }
      const id = await writeEpiconEntry(parsed.payload);
      if (!id) {
        return NextResponse.json(
          { ok: false, id: null, error: 'KV write skipped or failed (check KV env vars)' },
          { status: 503 },
        );
      }
      return NextResponse.json({ ok: true, id });
    }

    const body = (await request.json()) as CreateRequest;

    if (!body.title?.trim()) {
      return NextResponse.json({ ok: false, error: 'Title is required' }, { status: 400 });
    }
    if (!body.summary?.trim()) {
      return NextResponse.json({ ok: false, error: 'Summary is required' }, { status: 400 });
    }
    if (!body.sources?.length || !body.sources[0]?.trim()) {
      return NextResponse.json({ ok: false, error: 'At least one source is required' }, { status: 400 });
    }

    const epiconId = generateEpiconId();
    const now = new Date().toISOString();

    let authorProfile = null;
    if (body.submittedByLogin) {
      authorProfile = incrementEpiconCount(body.submittedByLogin);
    }

    const record: StoredEpicon = {
      id: epiconId,
      title: body.title.trim(),
      summary: body.summary.trim(),
      category: body.category || 'geopolitical',
      status: 'pending',
      confidenceTier: Math.max(0, Math.min(4, body.confidenceTier ?? 1)),
      ownerAgent: 'ECHO',
      sources: body.sources.filter((s) => s.trim()),
      tags: body.tags?.filter((t) => t.trim()) ?? [],
      timestamp: now,
      trace: [
        `User submitted EPICON from terminal${body.submittedBy ? ` (${body.submittedBy})` : ''}`,
        'ECHO intake — signal logged as pending',
        'Awaiting HERMES routing and ZEUS verification',
      ],
      submittedBy: body.submittedBy,
      submittedByLogin: body.submittedByLogin,
      submittedByMii: authorProfile?.miiScore,
      verificationOutcome: null,
      zeusNote: null,
      createdAt: now,
    };

    storeEpicon(record);

    return NextResponse.json({
      ok: true,
      epicon: record,
      authorProfile: authorProfile
        ? {
            login: authorProfile.login,
            miiScore: authorProfile.miiScore,
            nodeTier: authorProfile.nodeTier,
            epiconCount: authorProfile.epiconCount,
          }
        : null,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid request body' },
      { status: 400 },
    );
  }
}

export async function GET() {
  const items = await readEpiconFeedEntries(20);
  return NextResponse.json({
    ok: true,
    items,
    count: items.length,
  });
}
