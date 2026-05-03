import { NextResponse } from 'next/server';
import { getLatestSeal, listAllSeals } from '@/lib/vault-v2/store';
import { loadSubstrateRetryQueue } from '@/lib/vault-v2/substrate-attestation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type VerificationState = 'hot_sealed' | 'ledger_accepted' | 'ledger_rejected' | 'pending' | 'none';

function verificationState(seal: Awaited<ReturnType<typeof getLatestSeal>>): VerificationState {
  if (!seal) return 'none';
  if (seal.substrate_attestation_id || seal.substrate_event_hash) return 'ledger_accepted';
  if (seal.substrate_attestation_error) return 'ledger_rejected';
  if (seal.status === 'attested') return 'hot_sealed';
  return 'pending';
}

export async function GET() {
  const [latestSeal, recentSeals, retryQueue] = await Promise.all([
    getLatestSeal(),
    listAllSeals(25),
    loadSubstrateRetryQueue(),
  ]);

  const state = verificationState(latestSeal);
  const ledgerAccepted = recentSeals.filter((seal) => Boolean(seal.substrate_attestation_id || seal.substrate_event_hash));
  const ledgerRejected = recentSeals.filter((seal) => Boolean(seal.substrate_attestation_error) && !seal.substrate_attestation_id && !seal.substrate_event_hash);
  const hotSealed = recentSeals.filter((seal) => seal.status === 'attested' && !seal.substrate_attestation_id && !seal.substrate_event_hash && !seal.substrate_attestation_error);

  return NextResponse.json(
    {
      ok: true,
      state,
      latest: latestSeal
        ? {
            seal_id: latestSeal.seal_id,
            sequence: latestSeal.sequence,
            status: latestSeal.status,
            cycle: latestSeal.cycle_at_seal,
            sealed_at: latestSeal.sealed_at,
            seal_hash: latestSeal.seal_hash,
            substrate_attestation_id: latestSeal.substrate_attestation_id ?? null,
            substrate_event_hash: latestSeal.substrate_event_hash ?? null,
            substrate_attested_at: latestSeal.substrate_attested_at ?? null,
            substrate_attestation_error: latestSeal.substrate_attestation_error ?? null,
            immortalized: Boolean(latestSeal.substrate_attestation_id || latestSeal.substrate_event_hash),
          }
        : null,
      counts: {
        recent: recentSeals.length,
        ledger_accepted: ledgerAccepted.length,
        ledger_rejected: ledgerRejected.length,
        hot_sealed: hotSealed.length,
        retry_queue: retryQueue.length,
      },
      labels: {
        hot_sealed: 'HOT SEALED — KV seal exists, ledger pending',
        ledger_accepted: 'IMMORTALIZED — ledger accepted',
        ledger_rejected: 'LEDGER REJECTED — inspect substrate error',
        pending: 'PENDING — seal not finalized',
        none: 'NO SEAL — no reserve block found',
      },
      retry_queue: retryQueue.slice(0, 10),
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
