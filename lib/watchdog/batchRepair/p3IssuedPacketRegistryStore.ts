import { kvGetOrThrow, kvSet } from '@/lib/kv/store';
import {
  loadIssuedPacketRegistry,
  parseIssuedPacketRegistry,
  type IssuedPacketRegistry,
  type LoadIssuedPacketRegistryResult,
} from '@/lib/watchdog/batchRepair/p3IssuedPacketRegistry';

export const TRACK_R_P3_ISSUED_REGISTRY_KV_KEY = 'track-r:p3-issued:registry' as const;

export type IssuedPacketRegistrySource = 'kv' | 'committed' | 'unavailable';

export type LoadIssuedPacketRegistryResolved = {
  source: IssuedPacketRegistrySource;
  result: LoadIssuedPacketRegistryResult;
};

export function loadIssuedPacketRegistryFromKvRow(
  kvRow: IssuedPacketRegistry | null | undefined,
  options?: { readFailed?: boolean; readError?: string },
): LoadIssuedPacketRegistryResult {
  if (options?.readFailed) {
    return {
      ok: false,
      errors: [
        options.readError ??
          'Track R P3 issued registry KV read failed — intake blocked to avoid stale packet selection',
      ],
    };
  }
  if (kvRow == null) {
    return { ok: false, errors: ['Track R P3 issued registry KV row is empty'] };
  }
  return parseIssuedPacketRegistry(kvRow);
}

export async function loadIssuedPacketRegistryFromKv(): Promise<LoadIssuedPacketRegistryResult> {
  try {
    const kvRow = await kvGetOrThrow<IssuedPacketRegistry>(TRACK_R_P3_ISSUED_REGISTRY_KV_KEY);
    return loadIssuedPacketRegistryFromKvRow(kvRow);
  } catch (error) {
    return loadIssuedPacketRegistryFromKvRow(null, {
      readFailed: true,
      readError: `Track R P3 issued registry KV read failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
}

export async function saveIssuedPacketRegistryToKv(registry: IssuedPacketRegistry): Promise<boolean> {
  return kvSet(TRACK_R_P3_ISSUED_REGISTRY_KV_KEY, registry);
}

/**
 * Resolve issued-packet registry: KV is authoritative when valid; committed file is fallback.
 * Never fabricates packets when both sources are unavailable.
 */
export async function loadIssuedPacketRegistryResolved(args?: {
  repoRoot?: string;
}): Promise<LoadIssuedPacketRegistryResolved> {
  const kvResult = await loadIssuedPacketRegistryFromKv();
  if (kvResult.ok && kvResult.registry.entries.length > 0) {
    return { source: 'kv', result: kvResult };
  }

  const committed = loadIssuedPacketRegistry(args?.repoRoot);
  if (committed.ok && committed.registry.entries.length > 0) {
    const errors =
      kvResult.ok || kvResult.errors.length === 0 ? [] : [`kv_fallback: ${kvResult.errors.join('; ')}`];
    return {
      source: 'committed',
      result: errors.length > 0 ? { ok: true, registry: committed.registry } : committed,
    };
  }

  const errors = [
    ...(kvResult.ok ? [] : kvResult.errors),
    ...(committed.ok ? [] : committed.errors),
    ...(kvResult.ok && kvResult.registry.entries.length === 0 ? ['kv issued registry has no entries'] : []),
    ...(committed.ok && committed.registry.entries.length === 0 ? ['committed issued registry has no entries'] : []),
  ];
  return {
    source: 'unavailable',
    result: { ok: false, errors: errors.length > 0 ? errors : ['issued-packet registry unavailable'] },
  };
}

export async function syncCommittedIssuedPacketRegistryToKv(args?: {
  repoRoot?: string;
}): Promise<{ ok: true; entry_count: number } | { ok: false; errors: string[] }> {
  const committed = loadIssuedPacketRegistry(args?.repoRoot);
  if (!committed.ok) {
    return { ok: false, errors: committed.errors };
  }
  if (committed.registry.entries.length === 0) {
    return { ok: false, errors: ['committed issued registry has no entries to sync'] };
  }
  const saved = await saveIssuedPacketRegistryToKv(committed.registry);
  if (!saved) {
    return { ok: false, errors: ['Track R P3 issued registry KV write failed'] };
  }
  return { ok: true, entry_count: committed.registry.entries.length };
}
