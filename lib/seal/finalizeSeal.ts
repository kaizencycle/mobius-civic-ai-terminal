import { issueSeal } from '@/lib/seal/issueSeal';
import { buildSealRecord } from '@/lib/seal/buildSeal';
import { loadSeal, saveSeal } from '@/lib/seal/quarantineStore';

export async function finalizeSeal(
  sealId: string,
): Promise<{ ok: true; already_finalized?: boolean; seal: unknown } | { ok: false; reason: string }> {
  const seal = await loadSeal(sealId);
  if (!seal) return { ok: false, reason: 'seal_not_found' };

  if (seal.status === 'finalized') {
    return { ok: true, already_finalized: true, seal };
  }

  if (seal.status !== 're_attesting_passed') {
    return { ok: false, reason: 'not_ready_for_finalize' };
  }

  const anchorPayload = buildSealRecord({
    sealId: seal.seal_id,
    trancheId: `reconcile-${seal.cycle_at_seal}`,
    cycle: seal.cycle_at_seal,
    units: seal.reserve,
    attestation: {
      zeus: { agent: 'ZEUS', status: 'pass', score: 1 },
      atlas: { agent: 'ATLAS', status: 'pass', score: 1 },
      hermes: { agent: 'HERMES', status: 'pass', score: 1 },
    },
  });

  const issued = await issueSeal(anchorPayload);
  if (!issued.ok) return { ok: false, reason: issued.reason };

  seal.status = 'finalized';
  seal.reconciliation = {
    ...seal.reconciliation,
    finalized_at: new Date().toISOString(),
    reserve_increment_applied: true,
  };

  await saveSeal(sealId, seal);

  return { ok: true, seal };
}
