/**
 * GET/POST /api/cron/heartbeat — refresh fleet HEARTBEAT in KV (C-286).
 *
 * Schedule: every 30 minutes (`vercel.json`). Marks all canonical agents active
 * so `/api/agents/status` does not degrade on cycle-open KV gaps.
 *
 * C-298: also advances the sustain counter using the carry-forward GI value
 * so sustain tracking ticks even on heartbeat-only cycles between sweeps.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getEveSynthesisAuthError } from '@/lib/security/serviceAuth';
import { writeFleetHeartbeatKV } from '@/lib/runtime/agent-heartbeat-kv';
import {
  loadGIState,
  loadGIStateCarry,
  appendGiTrend,
  kvDel,
  kvGet,
  kvSet,
  KV_KEYS,
  type GIState,
  type GITrendEntry,
} from '@/lib/kv/store';
import { githubStateWriteJson, isGithubStateWriteConfigured } from '@/lib/github-state-cache';
import { updateSustainTrackingFromGi, seedSustainStateIfMissing } from '@/lib/mic/sustainTracker';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import { isBudgetSuspensionError } from '@/lib/substrate/kv-errors';
import { deriveGiFromSubstrate } from '@/lib/substrate/derive/gi';
import { kvGetOrThrow } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  const authErr = getEveSynthesisAuthError(req);
  if (authErr) return authErr;

  // OPT-04(C-352): dedup guard — skip write if last heartbeat was < 4 minutes ago.
  // C-356: use kvGetOrThrow so budget-suspension errors propagate (kvGet swallows them).
  let kvSuspended = false;
  try {
    const existing = await kvGetOrThrow<{ last_written?: number }>('heartbeat:last');
    if (existing?.last_written && Date.now() - existing.last_written < 4 * 60 * 1000) {
      return NextResponse.json({ skipped: true, reason: 'too_soon', timestamp: new Date().toISOString() });
    }
  } catch (err) {
    if (isBudgetSuspensionError(err)) {
      kvSuspended = true;
      console.warn('[cron/heartbeat] KV suspended — skipping dedup check and fleet write');
    }
    // Any other error: proceed with the write
  }

  let ok = false;
  const timestamp = new Date().toISOString();
  if (!kvSuspended) {
    ok = await writeFleetHeartbeatKV('cron-heartbeat');
    // writeFleetHeartbeatKV returns false on any KV failure (suspension or connectivity blip).
    // Treat false as a performance event — proceed to GI derivation rather than returning 503.
    if (!ok) kvSuspended = true;
  }

  // C-298: advance sustain counter. Use live GI if fresh, else carry-forward.
  // C-356: on KV suspension, fall back to CPC substrate derivation.
  let sustainStatus: string | null = null;
  let sustainCycles: number | null = null;
  let gi: number | null = null;
  try {
    const cycle = await resolveOperatorCycleId().catch(() => '');
    await seedSustainStateIfMissing(cycle || undefined);

    if (kvSuspended) {
      const derived = await deriveGiFromSubstrate();
      if (derived) gi = derived.global_integrity;
    } else {
      const giState = await loadGIState();
      if (giState && typeof giState.global_integrity === 'number') {
        const ageMs = Date.now() - new Date(giState.timestamp).getTime();
        if (ageMs < 15 * 60 * 1000) gi = giState.global_integrity;
      }
      if (gi === null) {
        const carry = await loadGIStateCarry();
        if (carry && typeof carry.global_integrity === 'number') gi = carry.global_integrity;
      }
    }

    if (gi !== null && cycle) {
      const sustain = await updateSustainTrackingFromGi(gi, cycle);
      if (sustain) {
        sustainStatus = sustain.status;
        sustainCycles = sustain.consecutiveEligibleCycles;
      }
    }
  } catch (e) {
    console.warn('[cron/heartbeat] sustain update failed:', e instanceof Error ? e.message : e);
  }

  // Append to the rolling GI trend (24-entry window, one per heartbeat cycle).
  // appendGiTrend already guards against KV unavailability — fire-and-forget.
  if (gi !== null) {
    const giMode = gi >= 0.8 ? 'green' : gi >= 0.6 ? 'yellow' : 'red';
    void appendGiTrend({ gi, mode: giMode, gi_verified: false, timestamp }).catch(() => {});
  }

  // OPT-07 (C-312): bust integrity-status KV cache so next page load recomputes
  // fresh GI rather than serving a stale 60s-cached result after a heartbeat tick.
  void Promise.all([
    kvDel('cache:integrity-status'),
    kvDel('cache:lane-diagnostics'),
  ]).catch(() => {});

  // OPT-9 (C-321): persist last-known snapshot so the shell endpoint can serve
  // real values on cold start instead of all-dashes.
  if (gi !== null) {
    const cycle = await resolveOperatorCycleId().catch(() => '');
    void kvSet(
      'terminal:last-known-snapshot',
      {
        gi,
        cycle: cycle || undefined,
        runtime: 'ok',
        ts: Date.now(),
      },
      86400,
    ).catch(() => {});
  }

  // C-322: low-frequency mirror of hot KV rows to GitHub `STATE/` (Contents API).
  // Awaited so serverless invocations do not return before Contents API writes complete.
  // Uses raw KV reads so we never recurse into federation read path. Bounded to ~12 writes/hr
  // by the heartbeat schedule; keeps a public cold tier when Upstash is throttled.
  if (isGithubStateWriteConfigured()) {
    try {
      const [giRow, trend] = await Promise.all([
        kvGet<GIState>(KV_KEYS.GI_STATE),
        kvGet<GITrendEntry[]>(KV_KEYS.GI_TREND),
      ]);
      await Promise.all([
        giRow
          ? githubStateWriteJson(
              'gi/latest.json',
              giRow,
              `state(gi): mirror heartbeat · GI ${Number(giRow.global_integrity).toFixed(3)}`,
            )
          : Promise.resolve(false),
        trend && trend.length > 0
          ? githubStateWriteJson('gi/trend.json', trend, 'state(gi): mirror heartbeat trend')
          : Promise.resolve(false),
      ]);
    } catch (e) {
      console.warn('[cron/heartbeat] github STATE mirror failed:', e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp,
    source: 'cron-heartbeat',
    kv_suspended: kvSuspended || undefined,
    sustain: sustainStatus !== null
      ? { status: sustainStatus, consecutiveEligibleCycles: sustainCycles }
      : null,
  });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
