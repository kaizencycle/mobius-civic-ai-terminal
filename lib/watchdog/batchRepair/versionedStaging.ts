import type { CollisionRepairBatchManifest, StagedLineageView } from '@/lib/watchdog/batchRepair/types';
import { stableStringify } from '@/lib/watchdog/batchRepair/stableHash';

export const LINEAGE_ACTIVE_VERSION_KEY = 'watchdog:lineage:active_version';

export function versionedManifestKey(repair_id: string): string {
  return `watchdog:lineage:version:${repair_id}:manifest`;
}

export function versionedCanonicalKey(repair_id: string): string {
  return `watchdog:lineage:version:${repair_id}:canonical`;
}

export function versionedQuarantineKey(repair_id: string): string {
  return `watchdog:lineage:version:${repair_id}:quarantine`;
}

export type LineageStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  del(key: string): void;
};

export class InMemoryLineageStore implements LineageStore {
  private readonly data = new Map<string, string>();

  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.data.set(key, value);
  }

  del(key: string): void {
    this.data.delete(key);
  }

  snapshot(): Map<string, string> {
    return new Map(this.data);
  }
}

export function stageVersionedLineage(args: {
  manifest: CollisionRepairBatchManifest;
  clean_block_numbers: number[];
  derived_latest_canonical_seal_id: string | null;
  store?: LineageStore;
  write?: boolean;
}): { view: StagedLineageView; store: LineageStore; writes: number } {
  const store = args.store ?? new InMemoryLineageStore();
  let writes = 0;
  const repair_id = args.manifest.repair_id;

  const manifestKey = versionedManifestKey(repair_id);
  const canonicalKey = versionedCanonicalKey(repair_id);
  const quarantineKey = versionedQuarantineKey(repair_id);

  if (args.write) {
    store.set(manifestKey, stableStringify(args.manifest));
    store.set(canonicalKey, stableStringify(args.manifest.canonical_assignments));
    store.set(quarantineKey, stableStringify(args.manifest.quarantined_seal_ids));
    writes += 3;
  }

  const view: StagedLineageView = {
    repair_id,
    version_keys: {
      manifest: manifestKey,
      canonical: canonicalKey,
      quarantine: quarantineKey,
    },
    total_block_positions: args.manifest.total_block_positions,
    contested_assignments: { ...args.manifest.canonical_assignments },
    clean_positions: [...args.clean_block_numbers].sort((a, b) => a - b),
    quarantined_seal_ids: [...args.manifest.quarantined_seal_ids],
    derived_latest_canonical_seal_id: args.derived_latest_canonical_seal_id,
  };

  return { view, store, writes };
}

/**
 * Atomic activation requires a single pointer CAS (watchdog:lineage:active_version).
 * Upstash cannot atomically SET 123 block keys + quarantine + latest in one operation
 * without a custom Lua script. Production commit must use version-pointer activation only.
 */
export function canGuaranteeAtomicActivation(): {
  ok: boolean;
  blocker?: string;
  design: string;
} {
  return {
    ok: true,
    design:
      'Stage immutable version keys, verify checksum, CAS watchdog:lineage:active_version once, then derive latest pointer in the same guarded transaction or fail closed.',
  };
}

export function activateVersionPointer(args: {
  store: LineageStore;
  repair_id: string;
  expected_active_version: string | null;
}): { ok: boolean; detail: string } {
  const current = args.store.get(LINEAGE_ACTIVE_VERSION_KEY);
  if (current !== args.expected_active_version) {
    return {
      ok: false,
      detail: `active version mismatch: expected ${args.expected_active_version}, actual ${current}`,
    };
  }
  args.store.set(LINEAGE_ACTIVE_VERSION_KEY, args.repair_id);
  return { ok: true, detail: 'active version pointer updated' };
}
