/**
 * GET/POST /api/cron/sweep — full micro-sensor sweep + GI + pulse (C-287).
 * Schedule: every 10 minutes in `vercel.json`. Lighter `/api/cron/heartbeat` stays at 5m.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getEveSynthesisAuthError } from '@/lib/security/serviceAuth';
import { runMicroSweepPipeline } from '@/lib/signals/runMicroSweep';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { appendFullCouncilJournalPulse } from '@/lib/agents/sentinel-cycle-journals';

export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  const authErr = getEveSynthesisAuthError(req);
  if (authErr) return authErr;
  try {
    const data = await runMicroSweepPipeline();
    const gi = typeof data.composite === 'number' && Number.isFinite(data.composite)
      ? data.composite
      : null;
    const council = await appendFullCouncilJournalPulse({
      cycle: currentCycleId(),
      gi,
      source: 'cron',
    });
    return NextResponse.json({
      ok: true,
      source: 'cron-sweep',
      timestamp: new Date().toISOString(),
      composite: data.composite,
      instrumentCount: data.instrumentCount ?? null,
      councilJournalPulse: {
        ok: council.ok,
        gi: council.gi,
        written: council.entries.length,
        agents: council.entries.map((entry) => entry.agent),
        failedAgents: council.failedAgents,
      },
    });
  } catch (err) {
    console.error('[cron/sweep] failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'sweep failed' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
