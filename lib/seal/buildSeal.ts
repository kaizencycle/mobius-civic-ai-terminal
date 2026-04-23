import crypto from 'node:crypto';
import type { SealRecord } from '@/lib/seal/types';

const sha256 = (value: string) =>
  `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

export function buildSealRecord(args: {
  sealId: string;
  trancheId: string;
  cycle: string;
  units: number;
  attestation: SealRecord['attestation'];
}): SealRecord {
  const base = {
    type: 'MOBIUS_SEAL_V1' as const,
    seal_id: args.sealId,
    tranche_id: args.trancheId,
    cycle: args.cycle,
    units: args.units,
    timestamp: new Date().toISOString(),
    attestation: args.attestation,
  };

  const source_hash = sha256(JSON.stringify(base));
  const seal_hash = sha256(JSON.stringify({ ...base, source_hash }));

  return {
    ...base,
    source_hash,
    seal_hash,
  };
}
