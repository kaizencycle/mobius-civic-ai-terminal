/**
 * EPICON Create API Route
 *
 * POST /api/epicon/create — User-submitted EPICON (terminal) or KV ledger write (Bearer BACKFILL_SECRET)
 * GET  /api/epicon/create — Last 20 entries from KV epicon feed (same list as /api/epicon/feed)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEchoStatus } from '@/lib/echo/store';
import { storeEpicon, incrementEpiconCount, type StoredEpicon } from '@/lib/mobius/stores';
import {
  type EpiconWritePayload,
  readEpiconFeedEntries,
  writeEpiconEntry,
} from '@/lib/epicon-writer';

export const dynamic = 'force-dynamic';

let submissionCounter = 0;

const EPICON_TYPES = [
  'heartbeat',
  'catalog',
  'zeus-verify',
  'zeus-report',
  'epicon',
  'merge',
] as const;

const EPICON_SEVERITIES = ['nominal', 'degraded', 'elevated', 'critical', 'info'] as const;

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

function isBackfillAuthorized(req: NextRequest): boolean {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function parseEpiconWritePayload(raw: unknown): EpiconWritePayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;

  if (
    typeof o.type !== 'string' ||
    !EPICON_TYPES.includes(o.type as (typeof EPICON_TYPES)[number])
  ) {
    return null;
  }
  if (
    typeof o.severity !== 'string' ||
    !EPICON_SEVERITIES.includes(o.severity as (typeof EPICON_SEVERITIES)[number])
  ) {
    return null;
  }
  if (typeof o.title !== 'string' || !o.title.trim()) return null;
  if (typeof o.author !== 'string' || !o.author.trim()) return null;

  return {
    type: o.type as EpiconWritePayload['type'],
    severity: o.severity as EpiconWritePayload['severity'],
    title: o.title.trim(),
    author: o.author.trim(),
    gi: typeof o.gi === 'number' ? o.gi : undefined,
    anomalies: Array.isArray(o.anomalies)
      ? o.anomalies.filter((x): x is string => typeof x === 'string')
      : undefined,
    cycle: typeof o.cycle === 'string' ? o.cycle : undefined,
    tags: Array.isArray(o.tags)
      ? o.tags.filter((x): x is string => typeof x === 'string')
      : undefined,
    verified: typeof o.verified === 'boolean' ? o.verified : undefined,
    verifiedBy: typeof o.verifiedBy === 'string' ? o.verifiedBy : undefined,
    body: typeof o.body === 'string' ? o.body : undefined,
  };
}

async function handleUserCreate(body: CreateRequest) {
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
}

export async function POST(request: NextRequest) {
  try {
    const raw: unknown = await request.json();

    if (isBackfillAuthorized(request)) {
      const payload = parseEpiconWritePayload(raw);
      if (!payload) {
        return NextResponse.json(
          { ok: false, error: 'Invalid EpiconWritePayload' },
          { status: 400 },
        );
      }
      const id = await writeEpiconEntry(payload);
      return NextResponse.json({ ok: true, id });
    }

    return handleUserCreate(raw as CreateRequest);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }
}

export async function GET() {
  const entries = await readEpiconFeedEntries(20);
  return NextResponse.json({
    ok: true,
    epicons: entries,
    count: entries.length,
  });
}
