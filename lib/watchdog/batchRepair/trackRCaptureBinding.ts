import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupportedLineageSnapshotVersion } from '@/lib/watchdog/batchRepair/lineageSnapshotVersionGuard';
import {
  CAPTURE_2014Z_EXPECTED_HASHES,
  CAPTURE_2014Z_ID,
  isTrackRV2GovernanceCaptureId,
  TRACK_R_DEFAULT_CAPTURE_ID,
  TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION,
} from '@/lib/watchdog/batchRepair/trackRCaptureV2Governance';
import {
  CAPTURE_0123Z_EXPECTED_HASHES,
  CAPTURE_0123Z_ID,
} from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';

export type TrackRCaptureBinding = {
  capture_id: string;
  archive_path: string;
  lineage_snapshot_version: SupportedLineageSnapshotVersion | 'v1';
  attestation_hashes: {
    semantic_manifest_hash: string;
    lineage_snapshot_hash: string;
    execution_witness_hash: string;
    rollback_manifest_hash: string;
    production_kv_identity_receipt_hash?: string;
    production_witness_seal_hash_pin_hash?: string;
  };
};

const CAPTURE_HISTORY_ROOTS = [
  'artifacts/C-404/track-r-lineage-v2/history',
  'artifacts/C-403/track-r-live-dry-run/history',
  'artifacts/C-404/track-r-live-dry-run/history',
] as const;

export {
  CAPTURE_2014Z_EXPECTED_HASHES,
  CAPTURE_2014Z_ID,
  isTrackRV2GovernanceCaptureId,
  TRACK_R_DEFAULT_CAPTURE_ID,
  TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION,
} from '@/lib/watchdog/batchRepair/trackRCaptureV2Governance';

function captureSuffixFromId(captureId: string): string | null {
  const match = /^track-r-c403-\d{4}-\d{2}-\d{2}T(\d{4}Z)$/i.exec(captureId.trim());
  return match?.[1] ?? null;
}

export function resolveTrackRCaptureArchivePath(args: {
  captureId: string;
  repoRoot?: string;
}): string | null {
  const suffix = captureSuffixFromId(args.captureId);
  if (!suffix) {
    return null;
  }
  const root = args.repoRoot ?? process.cwd();
  const dirName = `capture-${suffix}`;
  for (const historyRoot of CAPTURE_HISTORY_ROOTS) {
    const candidate = join(root, historyRoot, dirName);
    const packagePath = join(candidate, 'TRACK_R_LIVE_DRY_RUN_PACKAGE.json');
    const provenancePath = join(candidate, 'GITHUB_PROVENANCE.json');
    if (existsSync(packagePath) || existsSync(provenancePath)) {
      return candidate;
    }
  }
  return null;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

type GithubProvenanceRecord = {
  capture_id?: string;
  governance_candidate?: boolean;
  printed_console_output?: Record<string, string>;
  execution_witness_hash_v2?: string | null;
  production_kv_identity_receipt_hash?: string;
};

type CaptureProvenanceRecord = {
  governance_candidate?: boolean;
  execution_witness_hash_v2?: string;
};

function resolveV2ExecutionWitnessFromArchive(archivePath: string): string | null {
  const captureProv = readJson<CaptureProvenanceRecord>(join(archivePath, 'CAPTURE_PROVENANCE.json'));
  if (
    typeof captureProv?.execution_witness_hash_v2 === 'string' &&
    captureProv.execution_witness_hash_v2.length === 64
  ) {
    return captureProv.execution_witness_hash_v2;
  }

  const githubProv = readJson<GithubProvenanceRecord>(join(archivePath, 'GITHUB_PROVENANCE.json'));
  if (
    typeof githubProv?.execution_witness_hash_v2 === 'string' &&
    githubProv.execution_witness_hash_v2.length === 64
  ) {
    return githubProv.execution_witness_hash_v2;
  }

  return null;
}

/** Derive capture_id from an archive directory name such as `.../capture-0123Z`. */
export function resolveCaptureIdFromArchivePath(archivePath: string): string | null {
  const normalized = archivePath.replace(/\/$/, '');
  const match = /(?:^|\/)capture-(\d{4}Z)$/i.exec(normalized);
  if (!match) {
    return null;
  }
  return `track-r-c403-2026-08-15T${match[1]}`;
}

function resolveBindingFromGithubProvenance(args: {
  archivePath: string;
  captureId: string;
}): TrackRCaptureBinding | null {
  const provenancePath = join(args.archivePath, 'GITHUB_PROVENANCE.json');
  const provenance = readJson<GithubProvenanceRecord>(provenancePath);
  if (!provenance || provenance.governance_candidate !== true) {
    return null;
  }

  const resolvedCaptureId = String(provenance.capture_id ?? args.captureId);
  if (!isTrackRV2GovernanceCaptureId(resolvedCaptureId)) {
    return null;
  }

  const printed = provenance.printed_console_output ?? {};
  const lineageV2 = printed.lineage_snapshot_hash_v2;
  const semantic = printed.semantic_manifest_hash;
  const rollback = printed.rollback_manifest_hash;
  const witness = provenance.execution_witness_hash_v2;

  if (!lineageV2 || !semantic || !rollback || !witness) {
    return null;
  }

  return {
    capture_id: resolvedCaptureId,
    archive_path: args.archivePath,
    lineage_snapshot_version: TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION,
    attestation_hashes: {
      semantic_manifest_hash: semantic,
      lineage_snapshot_hash: lineageV2,
      execution_witness_hash: witness,
      rollback_manifest_hash: rollback,
      production_kv_identity_receipt_hash: provenance.production_kv_identity_receipt_hash,
    },
  };
}

function inferLineageSnapshotVersion(args: {
  captureId: string;
  packageBody: Record<string, unknown> | null;
}): SupportedLineageSnapshotVersion | 'v1' {
  if (!isTrackRV2GovernanceCaptureId(args.captureId)) {
    return 'v1';
  }

  const attestation = (args.packageBody?.attestation_hashes ?? {}) as Record<string, unknown>;
  const placeholders = (args.packageBody?.attestation_placeholders ?? {}) as Record<string, unknown>;
  const required = (placeholders.required_hashes ?? {}) as Record<string, unknown>;
  const declaredVersion =
    (attestation.lineage_snapshot_version as string | undefined) ??
    (required.lineage_snapshot_version as string | undefined);

  if (declaredVersion === TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION) {
    return TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION;
  }

  const lineageV2 =
    (attestation.lineage_snapshot_hash_v2 as string | undefined) ??
    (required.lineage_snapshot_hash_v2 as string | undefined);
  if (typeof lineageV2 === 'string' && lineageV2.length === 64) {
    return TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION;
  }

  return TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION;
}

function resolveLineageSnapshotHash(args: {
  version: SupportedLineageSnapshotVersion | 'v1';
  attestation: Record<string, string>;
  required: Record<string, string>;
}): string {
  if (args.version === TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION) {
    return (
      args.attestation.lineage_snapshot_hash_v2 ??
      args.required.lineage_snapshot_hash_v2 ??
      args.attestation.lineage_snapshot_hash ??
      args.required.lineage_snapshot_hash ??
      ''
    );
  }

  return args.attestation.lineage_snapshot_hash ?? args.required.lineage_snapshot_hash ?? '';
}

function resolveExecutionWitnessHash(args: {
  version: SupportedLineageSnapshotVersion | 'v1';
  attestation: Record<string, string>;
  required: Record<string, string>;
}): string {
  if (args.version === TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION) {
    return (
      args.attestation.execution_witness_hash_v2 ??
      args.required.execution_witness_hash_v2 ??
      args.attestation.execution_witness_hash ??
      args.required.execution_witness_hash ??
      ''
    );
  }

  return args.attestation.execution_witness_hash ?? args.required.execution_witness_hash ?? '';
}

/** Resolve attested hashes for a capture archive, defaulting to Capture #9 v2 governance binding. */
export function resolveTrackRCaptureBinding(args?: {
  captureId?: string;
  archivePath?: string;
  repoRoot?: string;
}): TrackRCaptureBinding {
  const repoRoot = args?.repoRoot ?? process.cwd();
  const explicitCaptureId = args?.captureId;

  let archivePath: string;
  let captureId: string;
  if (args?.archivePath) {
    archivePath = args.archivePath;
    captureId =
      explicitCaptureId ??
      resolveCaptureIdFromArchivePath(archivePath) ??
      TRACK_R_DEFAULT_CAPTURE_ID;
  } else if (explicitCaptureId !== undefined) {
    captureId = explicitCaptureId;
    if (!captureSuffixFromId(explicitCaptureId)) {
      throw new Error(`invalid capture_id format: ${explicitCaptureId}`);
    }
    const resolved = resolveTrackRCaptureArchivePath({ captureId: explicitCaptureId, repoRoot });
    if (!resolved) {
      throw new Error(`no capture archive found for capture_id ${explicitCaptureId}`);
    }
    archivePath = resolved;
  } else {
    captureId = TRACK_R_DEFAULT_CAPTURE_ID;
    archivePath =
      resolveTrackRCaptureArchivePath({ captureId, repoRoot }) ??
      join(repoRoot, 'artifacts/C-404/track-r-lineage-v2/history/capture-2014Z');
  }

  const pkg = readJson<Record<string, unknown>>(
    join(archivePath, 'TRACK_R_LIVE_DRY_RUN_PACKAGE.json'),
  );
  if (!pkg) {
    const provenanceBinding = resolveBindingFromGithubProvenance({ archivePath, captureId });
    if (provenanceBinding) {
      return provenanceBinding;
    }
    throw new Error(
      `TRACK_R_LIVE_DRY_RUN_PACKAGE.json and GITHUB_PROVENANCE.json missing under ${archivePath}`,
    );
  }

  const attestation = (pkg.attestation_hashes ?? {}) as Record<string, string>;
  const placeholders = (pkg.attestation_placeholders ?? {}) as Record<string, unknown>;
  const required = (placeholders.required_hashes ?? {}) as Record<string, string>;
  const resolvedCaptureId = String(pkg.capture_id ?? captureId);
  const lineageSnapshotVersion = inferLineageSnapshotVersion({
    captureId: resolvedCaptureId,
    packageBody: pkg,
  });

  const semantic =
    attestation.semantic_manifest_hash ?? required.semantic_manifest_hash ?? '';
  const lineage = resolveLineageSnapshotHash({
    version: lineageSnapshotVersion,
    attestation,
    required,
  });
  const witness = resolveExecutionWitnessHash({
    version: lineageSnapshotVersion,
    attestation,
    required,
  });
  const resolvedWitness =
    lineageSnapshotVersion === TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION &&
    isTrackRV2GovernanceCaptureId(resolvedCaptureId)
      ? (resolveV2ExecutionWitnessFromArchive(archivePath) ?? witness)
      : witness;
  const rollback =
    attestation.rollback_manifest_hash ?? required.rollback_manifest_hash ?? '';

  if (!lineage || !resolvedWitness || !semantic || !rollback) {
    throw new Error(`capture package under ${archivePath} missing required attestation hashes`);
  }

  const defaultKvIdentity =
    lineageSnapshotVersion === TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION
      ? CAPTURE_2014Z_EXPECTED_HASHES.production_kv_identity_receipt_hash
      : CAPTURE_0123Z_EXPECTED_HASHES.production_kv_identity_receipt_hash;

  return {
    capture_id: resolvedCaptureId,
    archive_path: archivePath,
    lineage_snapshot_version: lineageSnapshotVersion,
    attestation_hashes: {
      semantic_manifest_hash: semantic,
      lineage_snapshot_hash: lineage,
      execution_witness_hash: resolvedWitness,
      rollback_manifest_hash: rollback,
      production_kv_identity_receipt_hash:
        required.production_kv_identity_receipt_hash ?? defaultKvIdentity,
      production_witness_seal_hash_pin_hash:
        required.production_witness_seal_hash_pin_hash ??
        CAPTURE_0123Z_EXPECTED_HASHES.production_witness_seal_hash_pin_hash,
    },
  };
}
