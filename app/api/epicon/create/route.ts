/**
 * EPICON Create API Route
 *
 * POST /api/epicon/create — User-submitted EPICON (terminal) OR ledger write (Bearer BACKFILL_SECRET)
 * GET  /api/epicon/create — Last 20 entries from KV epicon feed (mobius:epicon:feed)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEchoStatus } from '@/lib/echo/store';
import {
  storeEpicon,
  getAllSubmittedEpicons,
  incrementEpiconCount,
  type StoredEpicon,
} from '@/lib/mobius/stores';
import {
  isLedgerEpiconPayload,
  readEpiconFeedSlice,
  writeEpiconEntry,
} from '@/lib/epicon-writer';

export const dynamic = 'force-dynamic';

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

function isLedgerAuthorized(req: NextRequest): boolean {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

type KvFeedItem = Record<string, unknown>;

function parseFeedEntry(raw: string): KvFeedItem | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as KvFeedItem) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const raw = await readEpiconFeedSlice(0, 19);
  const entries = raw.map(parseFeedEntry).filter((e): e is KvFeedItem => e !== null);

  return NextResponse.json({
    ok: true,
    entries,
    count: entries.length,
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (isLedgerEpiconPayload(body)) {
    if (!isLedgerAuthorized(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const id = await writeEpiconEntry(body);
    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'KV not configured or write failed' },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, id });
  }

  try {
    const b = body as CreateRequest;

    if (!b.title?.trim()) {
      return NextResponse.json({ ok: false, error: 'Title is required' }, { status: 400 });
    }
    if (!b.summary?.trim()) {
      return NextResponse.json({ ok: false, error: 'Summary is required' }, { status: 400 });
    }
    if (!b.sources?.length || !b.sources[0]?.trim()) {
      return NextResponse.json({ ok: false, error: 'At least one source is required' }, { status: 400 });
    }

    const epiconId = generateEpiconId();
    const now = new Date().toISOString();

    let authorProfile = null;
    if (b.submittedByLogin) {
      authorProfile = incrementEpiconCount(b.submittedByLogin);
    }

    const record: StoredEpicon = {
      id: epiconId,
      title: b.title.trim(),
      summary: b.summary.trim(),
      category: b.category || 'geopolitical',
      status: 'pending',
      confidenceTier: Math.max(0, Math.min(4, b.confidenceTier ?? 1)),
      ownerAgent: 'ECHO',
      sources: b.sources.filter((s) => s.trim()),
      tags: b.tags?.filter((t) => t.trim()) ?? [],
      timestamp: now,
      trace: [
        `User submitted EPICON from terminal${b.submittedBy ? ` (${b.submittedBy})` : ''}`,
        'ECHO intake — signal logged as pending',
        'Awaiting HERMES routing and ZEUS verification',
      ],
      submittedBy: b.submittedBy,
      submittedByLogin: b.submittedByLogin,
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
