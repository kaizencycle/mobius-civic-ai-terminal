/**
 * POST /api/eve/escalation-synthesize — EVE escalation-only governance synthesis (C-270).
 * Bearer: MOBIUS_SERVICE_SECRET | CRON_SECRET | BACKFILL_SECRET
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { processEveEscalationSynthesis } from '@/lib/eve/governance-synthesis';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { getServiceAuthError } from '@/lib/security/serviceAuth';
import { runSignalEngine } from '@/lib/signals/engine';

export const dynamic = 'force-dynamic';

type EscBody = {
  cycleId?: unknown;
  force?: unknown;
};

function parseBody(body: unknown): { cycleId: string | null; force: boolean } {
  if (body === null || typeof body !== 'object') {
    return { cycleId: null, force: false };
  }
  const o = body as EscBody;
  const raw = o.cycleId;
  const cycleId = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  const force = o.force === true;
  return { cycleId, force };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: 'POST with service Authorization when substrate escalation signals warrant an extra EVE synthesis',
    mode: 'escalation',
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

  const { cycleId: bodyCycle, force } = parseBody(body);
  const cycleId = bodyCycle ?? currentCycleId();

  await runSignalEngine();

  const payload = await processEveEscalationSynthesis(cycleId, force, null);
  return NextResponse.json(payload);
}
