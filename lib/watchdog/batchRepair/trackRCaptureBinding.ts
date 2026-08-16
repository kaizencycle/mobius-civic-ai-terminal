import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CAPTURE_0123Z_EXPECTED_HASHES,
  CAPTURE_0123Z_ID,
} from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';

export type TrackRCaptureBinding = {
  capture_id: string;
  archive_path: string;
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
  'artifacts/C-403/track-r-live-dry-run/history',
  'artifacts/C-404/track-r-live-dry-run/history',
] as const;

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
    if (existsSync(packagePath)) {
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

/** Resolve attested hashes for a capture archive, defaulting to Capture #5 governance binding. */
export function resolveTrackRCaptureBinding(args?: {
  captureId?: string;
  archivePath?: string;
  repoRoot?: string;
}): TrackRCaptureBinding {
  const repoRoot = args?.repoRoot ?? process.cwd();
  const captureId = args?.captureId ?? CAPTURE_0123Z_ID;
  const archivePath =
    args?.archivePath ??
    resolveTrackRCaptureArchivePath({ captureId, repoRoot }) ??
    join(repoRoot, 'artifacts/C-403/track-r-live-dry-run/history/capture-0123Z');

  const pkg = readJson<Record<string, unknown>>(
    join(archivePath, 'TRACK_R_LIVE_DRY_RUN_PACKAGE.json'),
  );
  if (!pkg) {
    throw new Error(`TRACK_R_LIVE_DRY_RUN_PACKAGE.json missing under ${archivePath}`);
  }

  const attestation = (pkg.attestation_hashes ?? {}) as Record<string, string>;
  const placeholders = (pkg.attestation_placeholders ?? {}) as Record<string, unknown>;
  const required = (placeholders.required_hashes ?? {}) as Record<string, string>;

  const semantic =
    attestation.semantic_manifest_hash ?? required.semantic_manifest_hash ?? '';
  const lineage =
    attestation.lineage_snapshot_hash ?? required.lineage_snapshot_hash ?? '';
  const witness =
    attestation.execution_witness_hash ?? required.execution_witness_hash ?? '';
  const rollback =
    attestation.rollback_manifest_hash ?? required.rollback_manifest_hash ?? '';

  if (!lineage || !witness || !semantic || !rollback) {
    throw new Error(`capture package under ${archivePath} missing required attestation hashes`);
  }

  return {
    capture_id: String(pkg.capture_id ?? captureId),
    archive_path: archivePath,
    attestation_hashes: {
      semantic_manifest_hash: semantic,
      lineage_snapshot_hash: lineage,
      execution_witness_hash: witness,
      rollback_manifest_hash: rollback,
      production_kv_identity_receipt_hash:
        required.production_kv_identity_receipt_hash ??
        CAPTURE_0123Z_EXPECTED_HASHES.production_kv_identity_receipt_hash,
      production_witness_seal_hash_pin_hash:
        required.production_witness_seal_hash_pin_hash ??
        CAPTURE_0123Z_EXPECTED_HASHES.production_witness_seal_hash_pin_hash,
    },
  };
}
