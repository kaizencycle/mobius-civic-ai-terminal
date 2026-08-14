import {
  getSealsByIdsPrimaryOnly,
  type PrimarySealReadResult,
} from '@/lib/vault-v2/store';
import type { Seal } from '@/lib/vault-v2/types';
import { computeSealHash, verifySealHash } from '@/lib/vault-v2/seal';
import type { CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';
import type { ExecutionWitnessRecordResult } from '@/lib/watchdog/batchRepair/executionWitnessHash';
import {
  liveSealsFromPrimaryReads,
  verifyProductionKvEnvironmentIdentity,
  type ProductionKvAnchorInput,
} from '@/lib/watchdog/batchRepair/kvEnvironmentIdentity';
import {
  resolveRequiredWitnessSealIds,
  verifyLiveSealWitnessExport,
  type LiveSealWitnessExport,
  type LiveSealWitnessRecord,
} from '@/lib/watchdog/batchRepair/executionWitness';
import type { LiveWitnessBlockedReason } from '@/lib/watchdog/batchRepair/processExitPolicy';
import type { C397Witness } from '@/lib/watchdog/batchRepair/witnessResolution';
import { hasUpstashKvCredentials } from '@/lib/kv/upstashEnv';

export type LiveSealWitnessExportAttempt = {
  ok: boolean;
  blocked_reason: LiveWitnessBlockedReason | null;
  export: LiveSealWitnessExport | null;
  comparison_results: ExecutionWitnessRecordResult[];
  /** Blocking verification failures only — must not include informational dry-run notes. */
  verification_errors: string[];
  /** Informational audit notes (e.g. dry-run manifest fixture pins) — never fail-closed alone. */
  verification_notes: string[];
  expected_universe_count: number;
  export_source: string;
  primary_read_count: number;
  fallback_read_count: number;
  uses_fixture_pinned_hashes: boolean;
  kv_identity_ok: boolean;
  live_seals: Seal[];
};

const PRIMARY_EXPORT_SOURCE = 'lib/vault-v2/store.getSealsByIdsPrimaryOnly';

export function manifestUsesFixturePinnedHashes(manifest: CollisionRepairBatchManifest): boolean {
  for (const receipt of manifest.receipts) {
    for (const hash of Object.values(receipt.original_hashes)) {
      if (hash.startsWith('fixture-hash-')) return true;
    }
  }
  return false;
}

export function resolveLiveWitnessBlockedReason(args: {
  kv_identity_blocked: LiveWitnessBlockedReason | null;
  summary: LiveSealWitnessExport['summary'];
  export_complete: boolean;
  fallback_read_count: number;
  verification_ok: boolean;
}): LiveWitnessBlockedReason | null {
  if (args.kv_identity_blocked) return args.kv_identity_blocked;
  if (args.fallback_read_count > 0 || args.summary.mismatch > 0) {
    return args.summary.mismatch > 0
      ? 'BLOCKED_LIVE_WITNESS_MISMATCH'
      : 'BLOCKED_LIVE_WITNESS_INCOMPLETE';
  }
  if (
    args.summary.missing > 0 ||
    args.summary.unexpected > 0 ||
    !args.export_complete ||
    !args.verification_ok
  ) {
    return 'BLOCKED_LIVE_WITNESS_INCOMPLETE';
  }
  return null;
}

function recomputePinnedWitnessHash(seal: Seal): string {
  return computeSealHash({
    seal_id: seal.seal_id,
    sequence: seal.sequence,
    cycle_at_seal: seal.cycle_at_seal,
    sealed_at: seal.sealed_at,
    reserve: seal.reserve,
    gi_at_seal: seal.gi_at_seal,
    mode_at_seal: seal.mode_at_seal,
    source_entries: seal.source_entries,
    deposit_hashes: seal.deposit_hashes,
    prev_seal_hash: seal.prev_seal_hash,
  });
}

/** Compare one live primary KV seal body against an independent canonical hash expectation. */
export function compareLiveSealWitnessRecord(args: {
  seal_id: string;
  liveSeal: Seal | null | undefined;
  provenance: PrimarySealReadResult['provenance'];
  expectedSet: Set<string>;
}): ExecutionWitnessRecordResult {
  if (!args.expectedSet.has(args.seal_id)) {
    return {
      seal_id: args.seal_id,
      status: 'UNEXPECTED',
      block_number: args.liveSeal?.sequence ?? null,
      live_kv_hash: args.liveSeal?.seal_hash ?? null,
      pinned_witness_hash: args.liveSeal ? recomputePinnedWitnessHash(args.liveSeal) : null,
    };
  }
  if (args.provenance !== 'primary' || !args.liveSeal) {
    return {
      seal_id: args.seal_id,
      status: 'MISSING',
      block_number: null,
      live_kv_hash: null,
      pinned_witness_hash: null,
    };
  }

  const live_kv_hash = args.liveSeal.seal_hash;
  const pinned_witness_hash = recomputePinnedWitnessHash(args.liveSeal);

  if (live_kv_hash.startsWith('fixture-hash-')) {
    return {
      seal_id: args.seal_id,
      status: 'MISMATCH',
      block_number: args.liveSeal.sequence,
      live_kv_hash,
      pinned_witness_hash,
    };
  }

  const blockMatch = args.liveSeal.sequence === extractBlockFromSealId(args.seal_id);
  const hashValid = verifySealHash(args.liveSeal);
  if (hashValid && blockMatch && args.liveSeal.status === 'attested') {
    return {
      seal_id: args.seal_id,
      status: 'MATCH',
      block_number: args.liveSeal.sequence,
      live_kv_hash,
      pinned_witness_hash,
    };
  }

  return {
    seal_id: args.seal_id,
    status: 'MISMATCH',
    block_number: args.liveSeal.sequence,
    live_kv_hash,
    pinned_witness_hash,
  };
}

function toLiveWitnessStatus(args: {
  seal_id: string;
  liveSeal: Seal | null | undefined;
  provenance: PrimarySealReadResult['provenance'];
  expectedSet: Set<string>;
}): ExecutionWitnessRecordResult {
  return compareLiveSealWitnessRecord(args);
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
  production_kv_anchors?: ProductionKvAnchorInput;
}): Promise<LiveSealWitnessExportAttempt> {
  const uses_fixture_pinned_hashes = manifestUsesFixturePinnedHashes(args.manifest);

  if (!hasUpstashKvCredentials()) {
    return {
      ok: false,
      blocked_reason: 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE',
      export: null,
      comparison_results: [],
      verification_errors: ['authenticated KV credentials unavailable in environment'],
      verification_notes: [],
      expected_universe_count: 0,
      export_source: PRIMARY_EXPORT_SOURCE,
      primary_read_count: 0,
      fallback_read_count: 0,
      uses_fixture_pinned_hashes,
      kv_identity_ok: false,
      live_seals: [],
    };
  }

  const identity = await verifyProductionKvEnvironmentIdentity({
    anchors: args.production_kv_anchors,
  });
  if (!identity.ok) {
    return {
      ok: false,
      blocked_reason: 'BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH',
      export: null,
      comparison_results: [],
      verification_errors: identity.errors,
      verification_notes: [],
      expected_universe_count: 0,
      export_source: PRIMARY_EXPORT_SOURCE,
      primary_read_count: 0,
      fallback_read_count: 0,
      uses_fixture_pinned_hashes,
      kv_identity_ok: false,
      live_seals: [],
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
      verification_notes: [],
      expected_universe_count: 0,
      export_source: PRIMARY_EXPORT_SOURCE,
      primary_read_count: 0,
      fallback_read_count: 0,
      uses_fixture_pinned_hashes,
      kv_identity_ok: true,
      live_seals: [],
    };
  }

  const expectedSealIds = resolved.seal_ids;
  const expectedSet = new Set(expectedSealIds);
  const batch = await getSealsByIdsPrimaryOnly(expectedSealIds);
  if (batch.chunk_errors.length > 0) {
    return {
      ok: false,
      blocked_reason: 'BLOCKED_AUTHENTICATED_LIVE_WITNESS_UNAVAILABLE',
      export: null,
      comparison_results: [],
      verification_errors: batch.chunk_errors,
      verification_notes: [],
      expected_universe_count: expectedSealIds.length,
      export_source: PRIMARY_EXPORT_SOURCE,
      primary_read_count: 0,
      fallback_read_count: 0,
      uses_fixture_pinned_hashes,
      kv_identity_ok: true,
      live_seals: [],
    };
  }

  const primaryReads = batch.reads;
  const live_seals = liveSealsFromPrimaryReads(primaryReads);
  const readById = new Map(primaryReads.map((read) => [read.seal_id, read]));

  let primary_read_count = 0;
  let fallback_read_count = 0;

  const comparison_results: ExecutionWitnessRecordResult[] = expectedSealIds.map((seal_id) => {
    const read = readById.get(seal_id);
    if (read?.provenance === 'primary') primary_read_count += 1;
    else fallback_read_count += 1;
    return toLiveWitnessStatus({
      seal_id,
      liveSeal: read?.seal ?? null,
      provenance: read?.provenance ?? 'missing',
      expectedSet,
    });
  });

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

  const summary = {
    total: comparison_results.length,
    match,
    mismatch,
    missing,
    unexpected,
  };

  const export_complete =
    fallback_read_count === 0 &&
    match === expectedSealIds.length &&
    mismatch === 0 &&
    missing === 0 &&
    unexpected === 0;

  const witnessExport: LiveSealWitnessExport = {
    schema_version: '1.0',
    capture_id: args.capture_id,
    exported_at: args.exported_at,
    authenticated_read: identity.ok && export_complete,
    export_source: PRIMARY_EXPORT_SOURCE,
    expected_seal_ids: expectedSealIds,
    records: comparison_results.map(toExportRecord),
    summary,
    export_complete,
  };

  const verification = verifyLiveSealWitnessExport(witnessExport, {
    expected_seal_ids: expectedSealIds,
  });

  const verification_errors = [...verification.errors];
  const verification_notes: string[] = [];
  if (uses_fixture_pinned_hashes) {
    verification_notes.push(
      'dry-run manifest receipt original_hashes use fixture-hash-* pins; live witness compares primary KV seal_hash against canonical recomputation',
    );
  }
  if (fallback_read_count > 0) {
    verification_errors.push(
      `primary-only read required — ${fallback_read_count} seal(s) missing from primary Upstash (no backup fallback permitted)`,
    );
  }

  const blocked_reason = resolveLiveWitnessBlockedReason({
    kv_identity_blocked: null,
    summary,
    export_complete,
    fallback_read_count,
    verification_ok: verification.ok,
  });

  return {
    ok: verification.ok && fallback_read_count === 0 && blocked_reason === null,
    blocked_reason,
    export: witnessExport,
    comparison_results,
    verification_errors,
    verification_notes,
    expected_universe_count: expectedSealIds.length,
    export_source: PRIMARY_EXPORT_SOURCE,
    primary_read_count,
    fallback_read_count,
    uses_fixture_pinned_hashes,
    kv_identity_ok: true,
    live_seals,
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
