/** KV pointer keys under `vault:seal:{id}` that are not seal bodies. */
export const RESERVED_VAULT_SEAL_IDS = new Set(['latest', 'candidate']);

const SEAL_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isReservedVaultSealId(sealId: string): boolean {
  return RESERVED_VAULT_SEAL_IDS.has(sealId);
}

export function validateMigratableSealId(
  sealId: unknown,
): { ok: true; sealId: string } | { ok: false; error: string } {
  if (typeof sealId !== 'string' || sealId.length === 0) {
    return { ok: false, error: 'sealId_required_alphanumeric' };
  }
  if (!SEAL_ID_PATTERN.test(sealId)) {
    return { ok: false, error: 'sealId_required_alphanumeric' };
  }
  if (isReservedVaultSealId(sealId)) {
    return { ok: false, error: `reserved_seal_id: ${sealId} is a CAS pointer key` };
  }
  return { ok: true, sealId };
}

export interface V1SealRecord {
  hash: string;
  cycle?: string;
  createdAt?: number;
  writtenAt?: number;
  [key: string]: unknown;
}

export function parseV1SealRecord(raw: unknown): V1SealRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const rec = raw as Record<string, unknown>;
  if (rec.schema_version) {
    return null;
  }
  if (typeof rec.hash !== 'string' || rec.hash.length === 0) {
    return null;
  }
  return rec as V1SealRecord;
}

export type KvInspectSealRow = { key: string; sample: unknown };

/** List legacy v1 seal ids from kvInspectSamples rows — excludes CAS pointer keys. */
export function listV1SealIdsFromKvInspect(rows: KvInspectSealRow[]): string[] {
  const v1Seals: string[] = [];
  for (const row of rows) {
    const suffix = row.key.replace(/^vault:seal:/, '');
    if (isReservedVaultSealId(suffix)) {
      continue;
    }
    if (parseV1SealRecord(row.sample)) {
      v1Seals.push(suffix);
    }
  }
  return v1Seals;
}
