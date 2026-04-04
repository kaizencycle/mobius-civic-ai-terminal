/**
 * POST /api/eve/cycle-synthesize — EVE governance / ethics synthesis → live EPICON ledger (C-270).
 * Optional `{"mode":"anthropic"}` proxies the model-backed C-626 pipeline (`/api/eve/pipeline-synthesize`).
 * Bearer: MOBIUS_SERVICE_SECRET | CRON_SECRET | BACKFILL_SECRET
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  buildEveGovernanceSynthesisOutput,
  cycleSynthesisIdempotencyTag,
  cycleWindowBucket,
  gatherEveGovernanceSynthesisInput,
  ledgerHasIdempotencyTag,
  publishEveGovernanceSynthesis,
  readLedgerRowsForEve,
} from '@/lib/eve/governance-synthesis';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { getServiceAuthError } from '@/lib/security/serviceAuth';
import { runSignalEngine } from '@/lib/signals/engine';

export const dynamic = 'force-dynamic';

type CycleBody = {
  cycleId?: unknown;
  force?: unknown;
  mode?: unknown;
};

function parseCycleBody(body: unknown): { cycleId: string | null; force: boolean; mode: string | null } {
  if (body === null || typeof body !== 'object') {
    return { cycleId: null, force: false, mode: null };
  }
  const o = body as CycleBody;
  const raw = o.cycleId;
  const cycleId = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  const force = o.force === true;
  const modeRaw = o.mode;
  const mode = typeof modeRaw === 'string' && modeRaw.trim() ? modeRaw.trim().toLowerCase() : null;
  return { cycleId, force, mode };
}

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

export async function GET() {
  const cycleId = currentCycleId();
  const windowBucket = cycleWindowBucket(Date.now());
  const idempotencyTag = cycleSynthesisIdempotencyTag(cycleId, windowBucket);

  return NextResponse.json({
    ok: true,
    info: 'POST with service Authorization for rule-based governance synthesis; {"mode":"anthropic"} runs the Claude pipeline',
    mode: 'cycle',
    currentCycle: cycleId,
    windowBucket,
    idempotencyTagPreview: idempotencyTag,
    anthropicPipeline: '/api/eve/pipeline-synthesize',
  });
}

export async function POST(request: NextRequest) {
  const authErr = getServiceAuthError(request);
  if (authErr) return authErr;

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text) as unknown;
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { cycleId: bodyCycle, force, mode } = parseCycleBody(body);

  if (mode === 'anthropic') {
    const base = serverBaseUrl(request);
    const authorization = request.headers.get('authorization') ?? '';
    const pipeRes = await fetch(`${base}/api/eve/pipeline-synthesize`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{}',
      cache: 'no-store',
    });
    const pipeJson = await readJson(pipeRes);
    if (pipeJson !== null && typeof pipeJson === 'object') {
      return NextResponse.json(pipeJson, { status: pipeRes.status });
    }
    return NextResponse.json({ ok: false, error: 'Pipeline returned empty body' }, { status: 502 });
  }

  const cycleId = bodyCycle ?? currentCycleId();

  await runSignalEngine();

  const allRows = await readLedgerRowsForEve(400);
  const nowMs = Date.now();
  const windowBucket = force ? `force-${nowMs}` : cycleWindowBucket(nowMs);
  const idempotencyTag = cycleSynthesisIdempotencyTag(cycleId, windowBucket);

  if (!force && ledgerHasIdempotencyTag(allRows, idempotencyTag)) {
    return NextResponse.json({
      ok: true,
      cycleId,
      mode: 'cycle' as const,
      published: false,
      reason: 'already_synthesized_for_window',
      idempotencyTag,
      derivedFromCount: 0,
    });
  }

  const input = await gatherEveGovernanceSynthesisInput(cycleId, { ledgerRows: allRows });
  const output = buildEveGovernanceSynthesisOutput(input);
  const publishResult = await publishEveGovernanceSynthesis(input, output, idempotencyTag, allRows);

  return NextResponse.json({
    ok: true,
    cycleId,
    mode: 'cycle' as const,
    published: publishResult.published,
    entryId: publishResult.entryId,
    reason: publishResult.published ? 'cycle_window_due' : 'already_synthesized_for_window',
    derivedFromCount: output.derivedFrom.length,
    idempotencyTag: publishResult.idempotencyTag,
    governancePosture: output.governancePosture,
    category: output.category,
    externalDegraded: input.externalDegraded,
  });
}
