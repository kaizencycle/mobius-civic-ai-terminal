import { getSealsByIds } from '@/lib/vault-v2/store';
import type { Seal } from '@/lib/vault-v2/types';
import type { CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';
import type { ExecutionWitnessRecordResult } from '@/lib/watchdog/batchRepair/executionWitnessHash';
import {
  collectTrackRWitnessSealIds,
  resolveRequiredWitnessSealIds,
  verifyLiveSealWitnessExport,
  type LiveSealWitnessExport,
  type LiveSealWitnessRecord,
} from '@/lib/watchdog/batchRepair/executionWitness';
import type { C397Witness } from '@/lib/watchdog/batchRepair/witnessResolution';
import { hasUpstashKvCredentials } from '@/lib/kv/upstashEnv';

export type LiveSealWitnessExportAttempt = {
  ok: boolean;
  blocked_reason: 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE' | null;
  export: LiveSealWitnessExport | null;
  comparison_results: ExecutionWitnessRecordResult[];
  verification_errors: string[];
  expected_universe_count: number;
  export_source: string;
};

export function buildPinnedHashMapFromManifest(
  manifest: CollisionRepairBatchManifest,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const receipt of manifest.receipts) {
    for (const [seal_id, hash] of Object.entries(receipt.original_hashes)) {
      map.set(seal_id, hash);
    }
  }
  return map;
}

function toLiveWitnessStatus(
  args: {
    seal_id: string;
    pinnedHash: string | undefined;
    liveSeal: Seal | null | undefined;
    expectedSet: Set<string>;
  },
): ExecutionWitnessRecordResult {
  if (!args.expectedSet.has(args.seal_id)) {
    return {
      seal_id: args.seal_id,
      status: 'UNEXPECTED',
      block_number: args.liveSeal?.sequence ?? null,
      live_kv_hash: args.liveSeal?.seal_hash ?? null,
      pinned_witness_hash: args.pinnedHash ?? null,
    };
  }
  if (!args.liveSeal) {
    return {
      seal_id: args.seal_id,
      status: 'MISSING',
      block_number: null,
      live_kv_hash: null,
      pinned_witness_hash: args.pinnedHash ?? null,
    };
  }
  if (!args.pinnedHash) {
    return {
      seal_id: args.seal_id,
      status: 'MISMATCH',
      block_number: args.liveSeal.sequence,
      live_kv_hash: args.liveSeal.seal_hash,
      pinned_witness_hash: null,
    };
  }
  const hashMatch = args.liveSeal.seal_hash === args.pinnedHash;
  const blockMatch = args.liveSeal.sequence === extractBlockFromSealId(args.seal_id);
  if (hashMatch && blockMatch && args.liveSeal.status === 'attested') {
    return {
      seal_id: args.seal_id,
      status: 'MATCH',
      block_number: args.liveSeal.sequence,
      live_kv_hash: args.liveSeal.seal_hash,
      pinned_witness_hash: args.pinnedHash,
    };
  }
  return {
    seal_id: args.seal_id,
    status: 'MISMATCH',
    block_number: args.liveSeal.sequence,
    live_kv_hash: args.liveSeal.seal_hash,
    pinned_witness_hash: args.pinnedHash,
  };
}

function extractBlockFromSealId(seal_id: string): number | null {
  const match = seal_id.match(/-(\d{3})$/);
  return match ? Number(match[1]) : null;
}

function toExportRecord(result: ExecutionWitnessRecordResult): LiveSealWitnessRecord {
  switch (result.status) {
    case 'MATCH':
      return {
        seal_id: result.seal_id,
        block_number: result.block_number,
        status: 'match',
        pinned_witness_hash: result.pinned_witness_hash,
        live_kv_hash: result.live_kv_hash,
      };
    case 'MISMATCH':
      return {
        seal_id: result.seal_id,
        block_number: result.block_number,
        status: 'mismatch',
        pinned_witness_hash: result.pinned_witness_hash,
        live_kv_hash: result.live_kv_hash,
      };
    case 'MISSING':
      return {
        seal_id: result.seal_id,
        block_number: result.block_number,
        status: 'missing',
        pinned_witness_hash: result.pinned_witness_hash,
        live_kv_hash: result.live_kv_hash,
      };
    case 'UNEXPECTED':
      return {
        seal_id: result.seal_id,
        block_number: result.block_number,
        status: 'unexpected',
        pinned_witness_hash: result.pinned_witness_hash,
        live_kv_hash: result.live_kv_hash,
      };
    default: {
      const _exhaustive: never = result.status;
      return _exhaustive;
    }
  }
}

export async function exportAuthenticatedLiveSealWitness(args: {
  capture_id: string;
  exported_at: string;
  environment_identifier: string;
  witness: C397Witness;
  manifest: CollisionRepairBatchManifest;
}): Promise<LiveSealWitnessExportAttempt> {
  const export_source = 'lib/vault-v2/store.getSealsByIds';

  if (!hasUpstashKvCredentials()) {
    return {
      ok: false,
      blocked_reason: 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE',
      export: null,
      comparison_results: [],
      verification_errors: ['authenticated KV credentials unavailable in environment'],
      expected_universe_count: 0,
      export_source,
    };
  }

  const resolved = resolveRequiredWitnessSealIds({
    witness: args.witness,
    manifest: args.manifest,
  });
  if (!resolved.ok) {
    return {
      ok: false,
      blocked_reason: 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE',
      export: null,
      comparison_results: [],
      verification_errors: resolved.errors,
      expected_universe_count: 0,
      export_source,
    };
  }

  const expectedSealIds = resolved.seal_ids;
  const expectedSet = new Set(expectedSealIds);
  const pinnedHashMap = buildPinnedHashMapFromManifest(args.manifest);
  const liveSeals = await getSealsByIds(expectedSealIds);
  const liveById = new Map(liveSeals.map((seal) => [seal.seal_id, seal]));

  const comparison_results: ExecutionWitnessRecordResult[] = expectedSealIds.map((seal_id) =>
    toLiveWitnessStatus({
      seal_id,
      pinnedHash: pinnedHashMap.get(seal_id),
      liveSeal: liveById.get(seal_id),
      expectedSet,
    }),
  );

  let match = 0;
  let mismatch = 0;
  let missing = 0;
  let unexpected = 0;
  for (const result of comparison_results) {
    switch (result.status) {
      case 'MATCH':
        match += 1;
        break;
      case 'MISMATCH':
        mismatch += 1;
        break;
      case 'MISSING':
        missing += 1;
        break;
      case 'UNEXPECTED':
        unexpected += 1;
        break;
      default: {
        const _exhaustive: never = result.status;
        throw new Error(`unknown result status: ${String(_exhaustive)}`);
      }
    }
  }

  const witnessExport: LiveSealWitnessExport = {
    schema_version: '1.0',
    capture_id: args.capture_id,
    exported_at: args.exported_at,
    authenticated_read: true,
    export_source,
    expected_seal_ids: expectedSealIds,
    records: comparison_results.map(toExportRecord),
    summary: {
      total: comparison_results.length,
      match,
      mismatch,
      missing,
      unexpected,
    },
    export_complete:
      match === expectedSealIds.length &&
      mismatch === 0 &&
      missing === 0 &&
      unexpected === 0,
  };

  const verification = verifyLiveSealWitnessExport(witnessExport, {
    expected_seal_ids: expectedSealIds,
  });

  return {
    ok: verification.ok,
    blocked_reason: verification.ok ? null : null,
    export: witnessExport,
    comparison_results,
    verification_errors: verification.errors,
    expected_universe_count: expectedSealIds.length,
    export_source,
  };
}

/** Redacted comparison summary safe for repository commit — hashes only, no seal bodies. */
export function redactLiveWitnessComparison(
  results: ExecutionWitnessRecordResult[],
): ExecutionWitnessRecordResult[] {
  return results.map((record) => ({
    seal_id: record.seal_id,
    status: record.status,
    block_number: record.block_number,
    live_kv_hash: record.live_kv_hash,
    pinned_witness_hash: record.pinned_witness_hash,
  }));
}
