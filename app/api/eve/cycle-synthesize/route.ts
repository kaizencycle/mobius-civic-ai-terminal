import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type SynthesizeResponse = {
  ok: boolean;
  cycleId?: string;
  itemCount?: number;
  synthesis?: unknown;
  error?: string;
};

type CandidateResponse = {
  ok: boolean;
  candidate?: {
    id: string;
  };
  error?: string;
};

type VerifyResponse = {
  ok: boolean;
  verdict?: 'confirmed' | 'flagged' | 'low-confidence' | 'contested';
  zeusScore?: number;
  error?: string;
};

type PublishResponse = {
  ok: boolean;
  published?: {
    id: string;
  };
  error?: string;
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
  });

  return (await res.json()) as T;
}

function isAuthorized(request: NextRequest): boolean {
  const auth = request.headers.get('authorization');
  const secret = process.env.BACKFILL_SECRET;

  if (!secret) {
    return false;
  }

  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  const cycleData = await jsonFetch<{ currentCycle?: string }>(
    `${request.nextUrl.origin}/api/eve/cycle-advance`
  ).catch(() => ({ currentCycle: 'unknown' }));

  return NextResponse.json({
    ok: true,
    info: 'POST to run full EVE synthesis pipeline for current cycle',
    pipeline: ['synthesize', 'candidate', 'verify', 'publish'],
    currentCycle: cycleData.currentCycle ?? 'unknown',
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Unauthorized',
      },
      { status: 401 }
    );
  }

  const base = request.nextUrl.origin;

  const cycleData: { currentCycle?: string } = await jsonFetch<{ currentCycle?: string }>(`${base}/api/eve/cycle-advance`).catch(() => ({ currentCycle: undefined }));
  const cycleId = cycleData.currentCycle ?? 'C-000';

  const synthesis = await jsonFetch<SynthesizeResponse>(`${base}/api/eve/synthesize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cycleId }),
  });

  if (!synthesis.ok || !synthesis.synthesis) {
    return NextResponse.json({
      ok: false,
      step: 'synthesize',
      error: synthesis.error ?? 'Unknown synthesize error',
    });
  }

  const candidate = await jsonFetch<CandidateResponse>(`${base}/api/epicon/candidates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      cycleId,
      synthesis: synthesis.synthesis,
    }),
  });

  if (!candidate.ok || !candidate.candidate?.id) {
    return NextResponse.json({
      ok: false,
      step: 'candidate',
      error: candidate.error ?? 'Unknown candidate error',
    });
  }

  const verify = await jsonFetch<VerifyResponse>(`${base}/api/zeus/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ candidateId: candidate.candidate.id }),
  });

  if (!verify.ok || !verify.verdict) {
    return NextResponse.json({
      ok: false,
      step: 'verify',
      error: verify.error ?? 'Unknown verify error',
    });
  }

  if (verify.verdict === 'contested') {
    return NextResponse.json({
      ok: true,
      published: false,
      reason: 'ZEUS contested — operator review required',
      candidate: candidate.candidate,
    });
  }

  const publish = await jsonFetch<PublishResponse>(`${base}/api/epicon/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ candidateId: candidate.candidate.id }),
  });

  if (!publish.ok || !publish.published?.id) {
    return NextResponse.json({
      ok: false,
      step: 'publish',
      error: publish.error ?? 'Unknown publish error',
    });
  }

  return NextResponse.json({
    ok: true,
    cycleId,
    timestamp: new Date().toISOString(),
    pipeline: {
      synthesize: { ok: true, itemCount: synthesis.itemCount ?? 0 },
      candidate: { ok: true, candidateId: candidate.candidate.id },
      verify: { ok: true, verdict: verify.verdict, zeusScore: verify.zeusScore ?? null },
      publish: { ok: true, entryId: publish.published.id },
    },
    entry: publish.published,
    message: 'EVE synthesis complete — EPICON entry committed to ledger',
  });
}
