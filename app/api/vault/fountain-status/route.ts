/**
 * GET /api/vault/fountain-status
 *
 * Diagnostic endpoint surfacing Fountain emission readiness:
 *   - Attested seals awaiting fountain emission (fountain_status: pending)
 *   - Activating seals (sustain window in progress)
 *   - Emitted seals (historical)
 *   - GI and sustain context needed for emission trigger
 *
 * Fountain emission requires: GI ≥ 0.95 AND 5 consecutive eligible cycles.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handbookCorsHeaders } from '@/lib/http/handbook-cors';
import { listAllSeals } from '@/lib/vault-v2/store';
import { loadGIState } from '@/lib/kv/store';
import { loadSustainState } from '@/lib/mic/sustainTracker';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import type { Seal } from '@/lib/vault-v2/types';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  if (!cors) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  const started = Date.now();

  try {
    const [allSeals, giState, sustainState, currentCycle] = await Promise.all([
      listAllSeals(100),
      loadGIState().catch(() => null),
      loadSustainState().catch(() => null),
      resolveOperatorCycleId().catch(() => 'unknown'),
    ]);

    const gi = giState && typeof giState.global_integrity === 'number' ? giState.global_integrity : null;
    const giAge = giState?.timestamp ? Date.now() - new Date(giState.timestamp).getTime() : null;
    const giFresh = giAge !== null && giAge < 15 * 60 * 1000;

    const pending = allSeals.filter((s: Seal) => s.status === 'attested' && s.fountain_status === 'pending');
    const activating = allSeals.filter((s: Seal) => s.status === 'attested' && s.fountain_status === 'activating');
    const emitted = allSeals
      .filter((s: Seal) => s.fountain_status === 'emitted')
      .sort((a: Seal, b: Seal) =>
        (b.fountain_emitted_at ?? '').localeCompare(a.fountain_emitted_at ?? ''),
      )
      .slice(0, 10);
    const expired = allSeals.filter((s: Seal) => s.fountain_status === 'expired');

    const mapSeal = (s: Seal) => ({
      seal_id: s.seal_id,
      sequence: s.sequence,
      cycle: s.cycle_at_seal,
      sealed_at: s.sealed_at,
      gi_at_seal: s.gi_at_seal,
      fountain_status: s.fountain_status,
      fountain_emitted_at: s.fountain_emitted_at,
      posture: s.posture,
    });

    const SUSTAIN_REQUIRED = 5;
    const GI_THRESHOLD = 0.95;
    const consecutiveEligible = sustainState?.consecutiveEligibleCycles ?? 0;
    const sustainAchieved = consecutiveEligible >= SUSTAIN_REQUIRED;
    const giEligible = gi !== null && gi >= GI_THRESHOLD;

    const emissionReady = sustainAchieved && giEligible && pending.length > 0;

    const body = {
      ok: true,
      at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      current_cycle: currentCycle,
      gi: {
        value: gi,
        fresh: giFresh,
        age_ms: giAge,
        threshold: GI_THRESHOLD,
        eligible: giEligible,
      },
      sustain: {
        status: sustainState?.status ?? 'not_started',
        consecutive_eligible_cycles: consecutiveEligible,
        required: SUSTAIN_REQUIRED,
        achieved: sustainAchieved,
      },
      emission_ready: emissionReady,
      pending_count: pending.length,
      activating_count: activating.length,
      emitted_count: emitted.length,
      expired_count: expired.length,
      pending_seals: pending.map(mapSeal),
      activating_seals: activating.map(mapSeal),
      recent_emitted: emitted.map(mapSeal),
    };

    return NextResponse.json(body, {
      headers: { ...(cors ?? {}) },
    });
  } catch (error) {
    console.error('[vault/fountain-status] error', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
