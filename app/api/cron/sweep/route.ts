/**
 * GET/POST /api/cron/sweep — full micro-sensor sweep + GI + pulse (C-287).
 * Schedule: every 10 minutes in `vercel.json`. Lighter `/api/cron/heartbeat` stays at 5m.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getEveSynthesisAuthError } from '@/lib/security/serviceAuth';
import { runMicroSweepPipeline } from '@/lib/signals/runMicroSweep';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import { appendFullCouncilJournalPulse } from '@/lib/agents/sentinel-cycle-journals';
import { updateSustainTrackingFromGi } from '@/lib/mic/sustainTracker';
import { getMergedMicReadiness } from '@/lib/mic/assembleMicReadiness';
import { persistLocalMicReadinessSnapshot } from '@/lib/mic/persistReadinessKv';

export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  const authErr = getEveSynthesisAuthError(req);
  if (authErr) return authErr;
  
  // C-301 FIX: Check the *write-path* substrate vars, not the public UI base URL.
  // NEXT_PUBLIC_SUBSTRATE_API_BASE is a browser-facing env used by the UI only.
  // Journal canonize and substrate writes use JOURNAL_CANON_SUBSTRATE_TARGET
  // (or SUBSTRATE_GITHUB_REPO / GITHUB_REPO_URL as fallbacks).
  const substrateWriteTarget =
    process.env.JOURNAL_CANON_SUBSTRATE_TARGET ??
    process.env.SUBSTRATE_GITHUB_REPO ??
    process.env.GITHUB_REPO_URL ??
    null;
  const substrateConfigured = Boolean(substrateWriteTarget);
  if (!substrateConfigured) {
    console.warn(
      '[cron/sweep] substrate write-path not configured: ' +
      'set JOURNAL_CANON_SUBSTRATE_TARGET (or SUBSTRATE_GITHUB_REPO / GITHUB_REPO_URL) ' +
      'to enable journal canonize and substrate attestation.',
    );
  }
  
  try {
    const data = await runMicroSweepPipeline();
    const gi = typeof data.composite === 'number' && Number.isFinite(data.composite)
      ? data.composite
      : null;

    let cycle: string;
    try {
      cycle = await resolveOperatorCycleId();
    } catch {
      cycle = currentCycleId();
    }

    // C-298: advance sustain counter on every sweep — was never called before this fix.
    // updateSustainTrackingFromGi is idempotent per cycle (same cycle returns stored state).
    let sustainResult: { status?: string; consecutiveEligibleCycles?: number } | null = null;
    try {
      sustainResult = await updateSustainTrackingFromGi(gi, cycle);
    } catch (e) {
      console.warn('[cron/sweep] sustain update failed:', e instanceof Error ? e.message : e);
    }

    const council = await appendFullCouncilJournalPulse({
      cycle,
      gi,
      source: 'cron',
    });

    console.info('[cron/sweep] cycle write', { cycle, written: council.entries.length });

    // Refresh micReadiness snapshot on every sweep so updatedAt stays current.
    void (async () => {
      try {
        const mic = await getMergedMicReadiness(cycle);
        await persistLocalMicReadinessSnapshot(mic);
      } catch (e) {
        console.warn('[cron/sweep] micReadiness refresh failed:', e instanceof Error ? e.message : e);
      }
    })();

    return NextResponse.json({
      ok: true,
      source: 'cron-sweep',
      timestamp: new Date().toISOString(),
      composite: data.composite,
      instrumentCount: data.instrumentCount ?? null,
      cycle,
      sustain: sustainResult
        ? {
            status: sustainResult.status,
            consecutiveEligibleCycles: sustainResult.consecutiveEligibleCycles,
          }
        : null,
      councilJournalPulse: {
        ok: council.ok,
        gi: council.gi,
        written: council.entries.length,
        agents: council.entries.map((entry) => entry.agent),
        failedAgents: council.failedAgents,
      },
      substrate_configured: substrateConfigured,
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
