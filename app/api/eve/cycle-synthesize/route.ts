/**
 * POST /api/eve/cycle-synthesize
 * - Default (C-270): idempotent governance/ethics synthesis → live EPICON ledger (`eve-synthesis`).
 * - `mode: "anthropic"`: legacy full pipeline (C-626) when ANTHROPIC_API_KEY + BACKFILL_SECRET are set.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { currentCycleId } from '@/lib/eve/cycle-engine';
import { runEveGovernanceSynthesis } from '@/lib/eve/governance-synthesis';

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

function governanceAuthOk(request: NextRequest): boolean {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret || !secret.trim()) return true;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

type PostBody = {
  mode?: string;
};

export async function GET(request: NextRequest) {
  const base = serverBaseUrl(request);
  const cycleRes = await fetch(`${base}/api/eve/cycle-advance`, { cache: 'no-store' });
  const cycleJson = (await readJson(cycleRes)) as { currentCycle?: string } | null;
  const currentCycle =
    typeof cycleJson?.currentCycle === 'string' && cycleJson.currentCycle.trim()
      ? cycleJson.currentCycle.trim()
      : currentCycleId();

  return NextResponse.json({
    ok: true,
    info: 'POST with {} for C-270 governance synthesis, or {"mode":"anthropic"} for legacy Claude pipeline',
    governance: 'POST /api/eve/cycle-synthesize — committed eve-synthesis ledger entry (idempotent per cycle)',
    legacy: 'mode "anthropic" requires ANTHROPIC_API_KEY and Authorization: Bearer BACKFILL_SECRET',
    currentCycle,
  });
}

export async function POST(request: NextRequest) {
  let body: PostBody = {};
  try {
    const raw = await request.json();
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      body = raw as PostBody;
    }
  } catch {
    body = {};
  }

  const mode = body.mode === 'anthropic' ? 'anthropic' : 'governance';

  if (mode === 'governance') {
    if (!governanceAuthOk(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runEveGovernanceSynthesis({ mode: 'cycle' });

    return NextResponse.json({
      ok: true,
      cycleId: result.cycleId,
      mode: 'cycle' as const,
      published: result.published,
      entryId: result.entryId,
      reason: result.reason,
      derivedFromCount: result.derivedFromCount,
      trace: {
        governancePosture: result.synthesis?.governancePosture ?? null,
        civicRiskLevel: result.synthesis?.civicRiskLevel ?? null,
        category: result.synthesis?.category ?? null,
      },
    });
  }

  const secret = process.env.BACKFILL_SECRET;
  if (!secret || !secret.trim()) {
    return NextResponse.json(
      { ok: false, error: 'Service authorization is not configured (set BACKFILL_SECRET)' },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: 'ANTHROPIC_API_KEY is not configured — anthropic synthesis disabled' },
      { status: 503 },
    );
  }

  const base = serverBaseUrl(request);
  const pipelineHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const cycleRes = await fetch(`${base}/api/eve/cycle-advance`, { cache: 'no-store' });
  const cycleJson = (await readJson(cycleRes)) as { currentCycle?: string } | null;
  const cycleId =
    typeof cycleJson?.currentCycle === 'string' && cycleJson.currentCycle.trim()
      ? cycleJson.currentCycle.trim()
      : 'C-0';

  const synRes = await fetch(`${base}/api/eve/synthesize`, {
    method: 'POST',
    headers: pipelineHeaders,
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

  const synthesisObj = synJson.synthesis;
  if (synthesisObj === null || typeof synthesisObj !== 'object') {
    return NextResponse.json(
      { ok: false, step: 'candidate', error: 'Synthesis response missing synthesis object' },
      { status: 502 },
    );
  }

  const candRes = await fetch(`${base}/api/epicon/candidates`, {
    method: 'POST',
    headers: pipelineHeaders,
    body: JSON.stringify({ cycleId, synthesis: synthesisObj }),
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
    headers: pipelineHeaders,
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
    headers: pipelineHeaders,
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
