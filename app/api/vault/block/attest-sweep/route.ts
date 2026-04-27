/**
 * GET /api/vault/block/attest-sweep
 *
 * Cron-driven back-attestation sweep (schedule: every 6h in vercel.json).
 * Finds all quarantined seals with missing sentinel attestations and submits
 * council votes from each agent that hasn't yet attested. Stops voting on a
 * seal as soon as quorum is reached.
 *
 * Auth: x-vercel-cron header (Vercel platform) OR Authorization: Bearer $CRON_SECRET.
 * In dev (no CRON_SECRET set) the endpoint is open.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { backAttestSeal, buildBackAttestRationale } from '@/lib/vault-v2/back-attest';
import { listAllSeals } from '@/lib/vault-v2/store';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret) return true;
  return bearerMatchesToken(req.headers.get('authorization'), secret);
}

type SealSweepResult = {
  seal_id: string;
  sequence: number;
  votes_submitted: number;
  transition: string;
  final_status: string;
  error?: string;
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const seals = await listAllSeals(100);
  const candidates = seals.filter(
    (s) => s.status === 'quarantined' || s.status === 'forming',
  );

  const results: SealSweepResult[] = [];

  for (const seal of candidates) {
    const result: SealSweepResult = {
      seal_id: seal.seal_id,
      sequence: seal.sequence,
      votes_submitted: 0,
      transition: 'none',
      final_status: seal.status,
    };

    for (const agent of SENTINEL_AGENTS) {
      if (seal.attestations[agent]) continue; // already attested — skip

      try {
        const r = await backAttestSeal({
          seal_id: seal.seal_id,
          agent,
          verdict: 'pass',
          rationale: buildBackAttestRationale(agent, seal.seal_id),
          posture: agent === 'AUREA' ? 'cautionary' : undefined,
        });

        if (r.ok) {
          result.votes_submitted += 1;
          result.transition = r.transition;
          result.final_status = r.status;
          if (r.transition === 'attested') break; // quorum reached — stop voting
        } else {
          result.error = r.reason;
          break;
        }
      } catch (err) {
        result.error = err instanceof Error ? err.message : 'unknown_error';
        break;
      }
    }

    results.push(result);
  }

  const attestedCount = results.filter((r) => r.final_status === 'attested').length;
  const errorCount = results.filter((r) => Boolean(r.error)).length;
  const totalVotes = results.reduce((s, r) => s + r.votes_submitted, 0);

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - started,
    seals_swept: candidates.length,
    results,
    summary: {
      attested: attestedCount,
      still_quarantined: results.filter((r) => r.final_status === 'quarantined').length,
      errors: errorCount,
      total_votes_submitted: totalVotes,
    },
  });
}
