/**
 * EPICON Create / KV ledger API (C-622)
 *
 * GET  /api/epicon/create — Last 20 entries from KV feed list
 * POST /api/epicon/create — Bearer-authenticated EpiconWritePayload → KV ledger
 *
 * User submissions: POST /api/epicon/submit
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isEpiconWritePayload,
  readEpiconFeedSlice,
  writeEpiconEntry,
} from '@/lib/epicon-writer';

export const dynamic = 'force-dynamic';

function isLedgerPostAuthorized(req: NextRequest): boolean {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET() {
  const entries = await readEpiconFeedSlice(20);
  return NextResponse.json({
    ok: true,
    epicons: entries,
    count: entries.length,
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isEpiconWritePayload(body)) {
    return NextResponse.json(
      { ok: false, error: 'Body must match EpiconWritePayload (type, severity, title, author)' },
      { status: 400 },
    );
  }

  if (!isLedgerPostAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const id = await writeEpiconEntry(body);
  if (id === null) {
    return NextResponse.json(
      { ok: false, error: 'KV not configured or write failed' },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, id });
}
