import { loadSeal } from '@/lib/seal/quarantineStore';

export async function reconcileSeal(sealId: string) {
  const seal = await loadSeal(sealId);
  if (!seal) return { ok: false as const, reason: 'seal_not_found' as const };

  return {
    ok: true as const,
    seal_id: seal.seal_id,
    cycle_at_seal: seal.cycle_at_seal,
    status: seal.status,
    quarantine_reason: seal.reconciliation.quarantine_reason,
    attempts: seal.reconciliation.attempt_count,
    last_attempt_result: seal.reconciliation.last_attempt_result,
  };
}
