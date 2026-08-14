import { readFileSync } from 'node:fs';
import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';

export type C397WitnessPair = {
  block_number: number;
  kept_seal_id: string;
  dropped_seal_id: string;
  kept_sealed_at?: string;
  dropped_sealed_at?: string;
  seal_hashes_differ?: boolean;
};

export type C397Witness = {
  schema_version: string;
  cycle: string;
  counts: {
    unique_block_count: number;
    collision_pair_count: number;
    hash_divergent_pair_count: number;
    contested_block_count: number;
    clean_block_count: number;
  };
  contested_block_numbers: number[];
  clean_block_numbers: number[];
  three_way_blocks?: number[];
  collisions: C397WitnessPair[];
};

export type ResolutionTableEntry = {
  seal_id: string;
  cycle: string;
  sealed_at: string;
};

export type CollisionResolutionTable = {
  cycle: string;
  strategy: string;
  approval_status: string;
  block_canonical: Record<string, ResolutionTableEntry>;
};

export function loadWitnessFromFile(path: string): C397Witness {
  return JSON.parse(readFileSync(path, 'utf8')) as C397Witness;
}

export function loadResolutionTableFromFile(path: string): CollisionResolutionTable {
  return JSON.parse(readFileSync(path, 'utf8')) as CollisionResolutionTable;
}

export function computeWitnessAuditHash(witness: C397Witness): string {
  return hashObject(witness as unknown as Record<string, unknown>);
}

export function computeResolutionTableHash(table: CollisionResolutionTable): string {
  return hashObject(table as unknown as Record<string, unknown>);
}

export function extractCanonicalAssignments(
  table: CollisionResolutionTable,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [block, entry] of Object.entries(table.block_canonical)) {
    out[block] = entry.seal_id;
  }
  return out;
}

export type WitnessBlockGroup = {
  block_number: number;
  candidate_seal_ids: string[];
  hash_divergent: boolean;
};

export function groupWitnessCollisions(witness: C397Witness): WitnessBlockGroup[] {
  const byBlock = new Map<number, Set<string>>();
  for (const pair of witness.collisions) {
    const set = byBlock.get(pair.block_number) ?? new Set<string>();
    set.add(pair.kept_seal_id);
    set.add(pair.dropped_seal_id);
    byBlock.set(pair.block_number, set);
  }

  return [...byBlock.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([block_number, ids]) => ({
      block_number,
      candidate_seal_ids: [...ids].sort(),
      hash_divergent: witness.collisions
        .filter((c) => c.block_number === block_number)
        .some((c) => c.seal_hashes_differ !== false),
    }));
}

export function collectQuarantinedSealIds(args: {
  witness: C397Witness;
  canonicalAssignments: Record<string, string>;
}): string[] {
  const quarantined = new Set<string>();
  for (const group of groupWitnessCollisions(args.witness)) {
    const canonical = args.canonicalAssignments[String(group.block_number)];
    if (!canonical) continue;
    for (const seal_id of group.candidate_seal_ids) {
      if (seal_id !== canonical) quarantined.add(seal_id);
    }
  }
  return [...quarantined].sort();
}
