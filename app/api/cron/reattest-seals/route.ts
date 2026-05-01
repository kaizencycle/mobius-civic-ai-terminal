/**
 * GET /api/cron/reattest-seals
 *
 * Hourly cron that explicitly drives back-attestation for every quarantined seal.
 * Complements the per-2-minute vault-attestation cron which can miss seals when
 * vault is below the formation threshold (vaultIdle path).
 *
 * Safe to run multiple times — backAttestSeal is idempotent per agent per seal.
 * Logs a full digest per run for observability.
 *
 * Schedule: 0 * * * * (hourly)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { listAllSeals } from '@/lib/vault-v2/store';
import { backAttestSeal, buildBackAttestRationale } from '@/lib/vault-v2/back-attest';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { releaseReplayPressureForAttestedSeal } from '@/lib/mic/replayPressure';
import type { Seal } from '@/lib/vault-v2/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cronHeader = req.headers.get('x-vercel-cron');
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET ?? '';
  const manuallyAuthed = bearerMatchesToken(authHeader, cronSecret);

  if (!cronHeader && !manuallyAuthed) {
    return NextResponse.json({ error: 'Cron-only endpoint' }, { status: 403 });
  }

  const started = Date.now();
  const results: Array<{
    seal_id: string;
    agent: string;
    ok: boolean;
    transition?: string;
    error?: string;
  }> = [];
  const errors: string[] = [];

  let allSeals: Seal[] = [];
  try {
    allSeals = await listAllSeals(200);
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: `listAllSeals failed: ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 500 });
  }

  const quarantined = allSeals.filter((s) => s.status === 'quarantined');

  for (const seal of quarantined) {
    for (const agent of SENTINEL_AGENTS) {
      if (seal.attestations[agent]) continue; // already attested

      try {
        const r = await backAttestSeal({
          seal_id: seal.seal_id,
          agent,
          verdict: 'pass',
          rationale: buildBackAttestRationale(agent, seal.seal_id),
          posture: agent === 'AUREA' ? 'cautionary' : undefined,
        });

        results.push({
          seal_id: seal.seal_id,
          agent,
          ok: r.ok,
          transition: r.ok ? r.transition : undefined,
          error: !r.ok ? r.reason : undefined,
        });

        if (r.ok && r.transition === 'attested') {
          void releaseReplayPressureForAttestedSeal().catch(() => {});
          console.info('[reattest-seals] seal transitioned → attested', { seal_id: seal.seal_id, agent });
          break; // seal is now attested; remaining agents are moot
        }
      } catch (e) {
        const msg = `${seal.seal_id}/${agent}: ${e instanceof Error ? e.message : String(e)}`;
        errors.push(msg);
        results.push({ seal_id: seal.seal_id, agent, ok: false, error: msg });
      }
    }
  }

  const attested = results.filter((r) => r.transition === 'attested').length;
  const recorded = results.filter((r) => r.transition === 'recorded').length;

  return NextResponse.json({
    ok: errors.length === 0,
    at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    quarantined_found: quarantined.length,
    attestations_attempted: results.length,
    attested_transitions: attested,
    recorded_transitions: recorded,
    errors,
    results,
  });
}
