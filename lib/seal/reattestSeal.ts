import { attestAtlas } from '@/lib/seal/attestAtlas';
import { attestHermes } from '@/lib/seal/attestHermes';
import { attestZeus } from '@/lib/seal/attestZeus';
import { loadSeal, saveSeal } from '@/lib/seal/quarantineStore';
import type { ReconciliationSealRecord, SealAttestation } from '@/lib/seal/types';

function mapAttestation(
  agent: string,
  status: 'pass' | 'fail',
  note: string,
  score: number,
): SealAttestation {
  return {
    agent,
    verdict: status === 'pass' ? 'pass' : 'flag',
    rationale: note,
    gi_at_attestation: score,
    timestamp: new Date().toISOString(),
    signature: `${agent.toLowerCase()}::${Date.now()}`,
  };
}

export async function reattestSeal(
  sealId: string,
): Promise<{ ok: true; passed: boolean; seal: ReconciliationSealRecord } | { ok: false; reason: string }> {
  const seal = await loadSeal(sealId);
  if (!seal) return { ok: false, reason: 'seal_not_found' };
  if (seal.status !== 'quarantined') return { ok: false, reason: 'not_quarantined' };

  seal.status = 're_attesting';
  seal.reconciliation = {
    ...seal.reconciliation,
    attempt_count: seal.reconciliation.attempt_count + 1,
    last_attempt_at: new Date().toISOString(),
  };

  await saveSeal(sealId, seal);

  const [zeus, atlas, hermes] = await Promise.all([
    attestZeus(seal.seal_id),
    attestAtlas(seal.seal_id),
    attestHermes(seal.seal_id),
  ]);

  seal.attestations = {
    ...seal.attestations,
    ZEUS: mapAttestation('ZEUS', zeus.status, zeus.notes ?? 're-attest', zeus.score),
    ATLAS: mapAttestation('ATLAS', atlas.status, atlas.notes ?? 're-attest', atlas.score),
    HERMES: mapAttestation('HERMES', hermes.status, hermes.notes ?? 're-attest', hermes.score),
  };

  const passed = zeus.status === 'pass' && atlas.status === 'pass';
  seal.reconciliation.last_attempt_result = passed ? 'pass' : 'fail';
  seal.status = passed ? 're_attesting_passed' : 'quarantined';

  await saveSeal(sealId, seal);

  return { ok: true, passed, seal };
}
