/**
 * GET/POST /api/cron/kv-watchdog
 *
 * EVE-attributed KV/Upstash watchdog (Option B — decoupled from cycle-synthesize).
 * EPICON: EPICON_C-370_EVE_kv-watchdog-implementation_v1
 *
 * Schedule: every 10 minutes (vercel.json) — tighter than daily reserve-canon-integrity.
 * Escalation: informational → EPICON; warning/critical → EPICON + Tripwire + EVE journal.
 * Hard-stop sealing: enabled via seal integrity gate when critical block_number_collisions
 * (EPICON_C-372_GOVERNANCE_seal-attestation-flag_v1). Rollback: SEAL_INTEGRITY_GATE=off.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import { runKvHealthChecks } from '@/lib/watchdog/kvHealthChecks';
import {
  escalateKvWatchdogReport,
} from '@/lib/watchdog/kvWatchdogEscalation';
import { clearSealIntegrityGateIfCollisionsResolved, getSealIntegrityGateState } from '@/lib/watchdog/sealIntegrityGate';
import { resolveKvWatchdogHttpOutcome } from '@/lib/watchdog/kvWatchdogHttpOutcome';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET ?? '';
  const manuallyAuthed = bearerMatchesToken(authHeader, cronSecret);

  if (!cronHeader && !manuallyAuthed) {
    return NextResponse.json({ ok: false, error: 'Cron-only endpoint' }, { status: 403 });
  }

  try {
    const operatorCycle = await resolveOperatorCycleId().catch(() => 'C-370');
    const report = await runKvHealthChecks();
    const escalation = await escalateKvWatchdogReport(report, operatorCycle);
    const gateCleared = await clearSealIntegrityGateIfCollisionsResolved(report);
    const sealGate = await getSealIntegrityGateState();
    const http = resolveKvWatchdogHttpOutcome({
      report,
      sealGate,
      degradedDependencies: escalation.degraded_dependencies,
    });

    console.info('[kv-watchdog] run complete', {
      cycle: operatorCycle,
      outcome: http.outcome,
      http_status: http.http_status,
      primary_reason: http.primary_reason,
      collision_count: http.collision_count,
      checks_complete: http.checks_complete,
      max_severity: report.max_severity,
      primary_kv_suspended: report.primary_kv_suspended,
      seal_integrity_gate_active: sealGate.active,
      degraded_dependencies: escalation.degraded_dependencies,
      escalation,
    });

    return NextResponse.json(
      {
        ok: http.outcome === 'ok' || http.outcome === 'informational',
        agent: 'EVE',
        epicon_id: 'EPICON_C-370_EVE_kv-watchdog-implementation_v1',
        operator_cycle: operatorCycle,
        outcome: http.outcome,
        http_status: http.http_status,
        primary_reason: http.primary_reason,
        collision_count: http.collision_count,
        checks_complete: http.checks_complete,
        report,
        escalation,
        seal_integrity_gate_cleared: gateCleared,
        hard_stop_enabled: http.hard_stop_enabled,
        seal_integrity_gate_active: http.seal_integrity_gate_active,
        degraded_dependencies: http.degraded_dependencies,
      },
      { status: http.http_status },
    );
  } catch (e) {
    console.error('[kv-watchdog] run failed:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
