import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';

export const DEFAULT_PRODUCTION_WITNESS_SEAL_HASH_PIN_PATH =
  'docs/epicon/cycles/C-403/fixtures/C403_PRODUCTION_WITNESS_SEAL_HASHES.pin.json';

export type ProductionWitnessSealHashPin = {
  schema_version: 'C403_PRODUCTION_WITNESS_SEAL_HASHES_1';
  cycle: string;
  witness_audit_hash: string;
  resolution_table_hash: string;
  established_by_capture_id: string;
  established_at: string;
  source: string;
  github_actions_run_id?: number;
  seal_count: number;
  seal_hashes: Record<string, string>;
};

export type ProductionWitnessSealHashPinLoadResult =
  | {
      ok: true;
      pin: ProductionWitnessSealHashPin;
      pin_hash: string;
      path: string;
    }
  | {
      ok: false;
      errors: string[];
      path: string;
    };

export function computeProductionWitnessSealHashPinHash(
  pin: Omit<ProductionWitnessSealHashPin, 'seal_count'> & { seal_hashes: Record<string, string> },
): string {
  const sorted_hashes = Object.fromEntries(
    Object.entries(pin.seal_hashes).sort(([a], [b]) => a.localeCompare(b)),
  );
  return hashObject({
    schema_version: pin.schema_version,
    cycle: pin.cycle,
    witness_audit_hash: pin.witness_audit_hash,
    resolution_table_hash: pin.resolution_table_hash,
    established_by_capture_id: pin.established_by_capture_id,
    established_at: pin.established_at,
    seal_hashes: sorted_hashes,
  });
}

export function validateProductionWitnessSealHashPin(
  pin: ProductionWitnessSealHashPin,
  args?: { expected_witness_audit_hash?: string | null },
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (pin.schema_version !== 'C403_PRODUCTION_WITNESS_SEAL_HASHES_1') {
    errors.push(`unsupported pin schema_version ${pin.schema_version}`);
  }
  const ids = Object.keys(pin.seal_hashes);
  if (ids.length === 0) {
    errors.push('production witness seal hash pin must include at least one seal hash');
  }
  if (pin.seal_count !== ids.length) {
    errors.push(`seal_count (${pin.seal_count}) must match seal_hashes entries (${ids.length})`);
  }
  if (args?.expected_witness_audit_hash && pin.witness_audit_hash !== args.expected_witness_audit_hash) {
    errors.push(
      `pin witness_audit_hash ${pin.witness_audit_hash} does not match expected ${args.expected_witness_audit_hash}`,
    );
  }
  for (const [seal_id, hash] of Object.entries(pin.seal_hashes)) {
    if (!hash || hash.length !== 64) {
      errors.push(`invalid hash for seal ${seal_id}`);
    }
    if (hash.startsWith('fixture-hash-')) {
      errors.push(`fixture hash not permitted in production pin for ${seal_id}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function loadProductionWitnessSealHashPin(args?: {
  path?: string;
  expected_witness_audit_hash?: string | null;
}): ProductionWitnessSealHashPinLoadResult {
  const path = args?.path ?? join(process.cwd(), DEFAULT_PRODUCTION_WITNESS_SEAL_HASH_PIN_PATH);
  try {
    const pin = JSON.parse(readFileSync(path, 'utf8')) as ProductionWitnessSealHashPin;
    const validation = validateProductionWitnessSealHashPin(pin, {
      expected_witness_audit_hash: args?.expected_witness_audit_hash,
    });
    if (!validation.ok) {
      return { ok: false, errors: validation.errors, path };
    }
    return {
      ok: true,
      pin,
      pin_hash: computeProductionWitnessSealHashPinHash(pin),
      path,
    };
  } catch (err) {
    return {
      ok: false,
      errors: [err instanceof Error ? err.message : String(err)],
      path,
    };
  }
}

export function buildPinnedHashLookup(
  pin: ProductionWitnessSealHashPin,
): ReadonlyMap<string, string> {
  return new Map(Object.entries(pin.seal_hashes));
}
