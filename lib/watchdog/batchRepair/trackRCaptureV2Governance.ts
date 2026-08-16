import type { SupportedLineageSnapshotVersion } from '@/lib/watchdog/batchRepair/lineageSnapshotVersionGuard';

/** Capture #9 — sole CAS-v2 governance candidate (C-405). */
export const CAPTURE_2014Z_ID = 'track-r-c403-2026-08-15T2014Z' as const;

export const CAPTURE_2014Z_ARCHIVE_PATH =
  'artifacts/C-404/track-r-lineage-v2/history/capture-2014Z' as const;

export const CAPTURE_2014Z_EXPECTED_HASHES = {
  semantic_manifest_hash: '27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa',
  /** v2 lineage snapshot hash — canonical CAS gate for new execution attempts. */
  lineage_snapshot_hash: 'b5f781f6992e6d000289ca130eba15d9150e7a2ce59c280384d57a2c149ef9fb',
  /** v2 execution witness hash — binds lineage_snapshot_version v2 + v2 lineage hash. */
  execution_witness_hash: 'e08999decbcdaaac06d91a9a11f06e6737756a646800db90ad8e57b865c1ccf1',
  rollback_manifest_hash: '0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d',
  production_kv_identity_receipt_hash:
    'fc84f950ed17d3863e2f7d24eac6eb3c54a7434913a47aa49c7374cce296726e',
} as const;

export const TRACK_R_DEFAULT_CAPTURE_ID = CAPTURE_2014Z_ID;

export const TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION: SupportedLineageSnapshotVersion = 'v2';

export function isTrackRV2GovernanceCaptureId(captureId: string): boolean {
  return captureId.trim() === CAPTURE_2014Z_ID;
}
