/**
 * POST /api/eve/cycle-synthesize — Full EVE → EPICON → ZEUS → ledger pipeline (C-626)
 * Protected: Authorization Bearer BACKFILL_SECRET
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function serverBaseUrl(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://127.0.0.1:3000';
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const base = serverBaseUrl(request);
  const cycleRes = await fetch(`${base}/api/eve/cycle-advance`, { cache: 'no-store' });
  const cycleJson = (await readJson(cycleRes)) as { currentCycle?: string } | null;

  return NextResponse.json({
    ok: true,
    info: 'POST to run full EVE synthesis pipeline for current cycle',
    pipeline: ['synthesize', 'candidate', 'verify', 'publish'],
    currentCycle: cycleJson?.currentCycle ?? null,
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret || !secret.trim()) {
    return NextResponse.json({ ok: false, error: 'BACKFILL_SECRET is not configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const base = serverBaseUrl(request);

  const cycleRes = await fetch(`${base}/api/eve/cycle-advance`, { cache: 'no-store' });
  const cycleJson = (await readJson(cycleRes)) as { currentCycle?: string } | null;
  const cycleId =
    typeof cycleJson?.currentCycle === 'string' && cycleJson.currentCycle.trim()
      ? cycleJson.currentCycle.trim()
      : 'C-0';

  const synRes = await fetch(`${base}/api/eve/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ cycleId }),
    cache: 'no-store',
  });
  const synJson = (await readJson(synRes)) as Record<string, unknown> | null;
  if (!synRes.ok || !synJson || synJson.ok !== true) {
    return NextResponse.json(
      {
        ok: false,
        step: 'synthesize',
        error: typeof synJson?.error === 'string' ? synJson.error : 'Synthesis failed',
        details: synJson,
      },
      { status: synRes.ok ? 502 : synRes.status },
    );
  }

  const itemCount = typeof synJson.itemCount === 'number' ? synJson.itemCount : 0;

  const synthesisPayload = synJson.synthesis;
  const candRes = await fetch(`${base}/api/epicon/candidates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ cycleId, synthesis: synthesisPayload }),
    cache: 'no-store',
  });
  const candJson = (await readJson(candRes)) as Record<string, unknown> | null;
  if (!candRes.ok || !candJson || candJson.ok !== true) {
    return NextResponse.json(
      {
        ok: false,
        step: 'candidate',
        error: typeof candJson?.error === 'string' ? candJson.error : 'Candidate creation failed',
        details: candJson,
      },
      { status: candRes.ok ? 502 : candRes.status },
    );
  }

  const candidate = candJson.candidate as { id?: string } | undefined;
  const candidateId = typeof candidate?.id === 'string' ? candidate.id : '';
  if (!candidateId) {
    return NextResponse.json(
      { ok: false, step: 'candidate', error: 'Missing candidate id in response' },
      { status: 502 },
    );
  }

  const verRes = await fetch(`${base}/api/zeus/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ candidateId }),
    cache: 'no-store',
  });
  const verJson = (await readJson(verRes)) as Record<string, unknown> | null;
  if (!verRes.ok || !verJson || verJson.ok !== true) {
    return NextResponse.json(
      {
        ok: false,
        step: 'verify',
        error: typeof verJson?.error === 'string' ? verJson.error : 'Verification failed',
        details: verJson,
      },
      { status: verRes.ok ? 502 : verRes.status },
    );
  }

  const verdict = typeof verJson.verdict === 'string' ? verJson.verdict : '';
  const zeusScore = typeof verJson.zeusScore === 'number' ? verJson.zeusScore : 0;

  if (verdict === 'contested') {
    return NextResponse.json({
      ok: true,
      published: false,
      reason: 'ZEUS contested — operator review required',
      candidate: candJson.candidate,
      cycleId,
      timestamp: new Date().toISOString(),
    });
  }

  const pubRes = await fetch(`${base}/api/epicon/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ candidateId }),
    cache: 'no-store',
  });
  const pubJson = (await readJson(pubRes)) as Record<string, unknown> | null;
  if (!pubRes.ok || !pubJson || pubJson.ok !== true) {
    return NextResponse.json(
      {
        ok: false,
        step: 'publish',
        error: typeof pubJson?.error === 'string' ? pubJson.error : 'Publish failed',
        details: pubJson,
      },
      { status: pubRes.ok ? 502 : pubRes.status },
    );
  }

  const published = pubJson.published as Record<string, unknown> | undefined;
  const entryId = typeof published?.id === 'string' ? published.id : candidateId;

  return NextResponse.json({
    ok: true,
    cycleId,
    timestamp: new Date().toISOString(),
    pipeline: {
      synthesize: { ok: true, itemCount },
      candidate: { ok: true, candidateId },
      verify: { ok: true, verdict, zeusScore },
      publish: { ok: true, entryId },
    },
    entry: pubJson.published,
    message: 'EVE synthesis complete — EPICON entry committed to ledger',
  });
}
