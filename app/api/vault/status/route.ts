/**
 * GET /api/vault/status
 *
 * v1 + v2 compatibility window (Vault v2 spec §10).
 *
 * Returns the v1 shape unchanged for backward compatibility, AND appends
 * v2 fields: seals_count, latest_seal_at, candidate_attestation_state, etc.
 *
 * During the C-284 → C-285 compatibility window, `balance_reserve` is
 * preserved as a v1 alias (still read from v1 KV, not aliased to
 * `in_progress_balance`) so existing UI surfaces keep working. A new
 * `in_progress_balance` field exposes the v2 canonical accumulator.
 */

import { NextResponse } from 'next/server';
import { loadGIState } from '@/lib/kv/store';
import { getVaultStatusPayload } from '@/lib/vault/vault';
import {
  countSeals,
  getCandidate,
  getInProgressBalance,
  getLatestSeal,
} from '@/lib/vault-v2/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  let gi: number | null = null;
  try {
    const st = await loadGIState();
    if (st && typeof st.global_integrity === 'number' && Number.isFinite(st.global_integrity)) {
      gi = Math.max(0, Math.min(1, st.global_integrity));
    }
  } catch {
    gi = null;
  }

  const v1 = await getVaultStatusPayload(gi);

  const [inProgressBalance, sealsCount, latestSeal, candidate] = await Promise.all([
    getInProgressBalance(),
    countSeals(),
    getLatestSeal(),
    getCandidate(),
  ]);

  const body = {
    ...v1,
    in_progress_balance: inProgressBalance,
    seals_count: sealsCount,
    latest_seal_id: latestSeal?.seal_id ?? null,
    latest_seal_at: latestSeal?.sealed_at ?? null,
    latest_seal_hash: latestSeal?.seal_hash ?? null,
    candidate_attestation_state: candidate
      ? {
          in_flight: true,
          seal_id: candidate.seal_id,
          sequence: candidate.sequence,
          requested_at: candidate.requested_at,
          timeout_at: candidate.timeout_at,
          attestations_received: Object.keys(candidate.attestations).length,
          attestations_needed: 5 - Object.keys(candidate.attestations).length,
        }
      : {
          in_flight: false,
          seal_id: null,
          attestations_received: 0,
          timeout_at: null,
        },
    vault_version: 2,
    canonical: 'in_progress_balance',
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'vault-status-v2' },
  });
}
