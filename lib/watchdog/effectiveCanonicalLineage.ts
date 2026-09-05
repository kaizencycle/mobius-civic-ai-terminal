/**
 * C-425 — Effective Track R canonical lineage loader.
 *
 * Bridges the runtime watchdog/gate path to Track R's versioned lineage
 * snapshot (`watchdog:lineage:*`, written by
 * `lib/watchdog/batchRepair/versionedStaging.ts`) rather than the separate,
 * also-unwired C-373 flat canonical index (`lib/watchdog/canonicalLineageIndex.ts`).
 * See docs/epicon/cycles/C-417/EPICON_C-417_GOV_track-r-lineage-gate-wiring-gap_v1.md
 * for why this bridge did not previously exist: the versioned lineage index had
 * no runtime reader anywhere in the collision-detection or gate-blocking path.
 *
 * Fail-closed by construction: any missing key, hash mismatch, or malformed
 * payload returns `ok: false` with a specific reason. Callers must treat that
 * as "no trustworthy lineage" — never as an empty-but-valid canonical map.
 */

import { kvGetPrimaryOnly } from '@/lib/kv/store';
import { verifyManifestHash } from '@/lib/watchdog/batchRepair/semanticManifest';
import {
  LINEAGE_ACTIVE_VERSION_KEY,
  versionedCanonicalKey,
  versionedManifestKey,
  versionedQuarantineKey,
} from '@/lib/watchdog/batchRepair/versionedStaging';
import type { CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';
import type { CanonicalIndexSnapshot } from '@/lib/watchdog/canonicalLineageResolve';

export type EffectiveCanonicalLineageFailureReason =
  | 'no_active_version'
  | 'manifest_missing'
  | 'manifest_malformed'
  | 'manifest_hash_mismatch'
  | 'canonical_map_missing'
  | 'canonical_map_malformed'
  | 'canonical_map_manifest_mismatch'
  | 'quarantine_list_missing'
  | 'quarantine_list_malformed'
  | 'quarantine_list_manifest_mismatch'
  | 'read_error';

export type EffectiveCanonicalLineage =
  | {
      ok: true;
      active_version: string;
      canonical_index: CanonicalIndexSnapshot;
      quarantined: Set<string>;
      manifest: CollisionRepairBatchManifest;
    }
  | {
      ok: false;
      active_version: string | null;
      reason: EffectiveCanonicalLineageFailureReason;
      detail: string;
    };

/** Minimal KV reader shape — allows tests to inject a fake map without touching real KV. */
export type LineageKvReader = (key: string) => Promise<unknown>;

/**
 * Primary-KV-only by default — `kvGet()` falls back to backup Redis / the bridge
 * on a primary miss or failure, which would let a stale copy of Track R's
 * lineage (e.g. one removed or superseded on primary) be treated as live
 * authority for clearing the seal integrity gate. `kvGetPrimaryOnly()` is the
 * primitive this codebase already reserves for exactly this class of read
 * (see `lib/watchdog/batchRepair/liveLineagePointerObservations.ts`, which
 * reads `watchdog:lineage:active_version` the same way).
 */
const defaultReader: LineageKvReader = (key) => kvGetPrimaryOnly(key);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Load the effective, currently-active Track R canonical/quarantine lineage.
 * Reads only `watchdog:lineage:*` — never mutates any key. Missing, corrupt,
 * or hash-inconsistent state is reported as `ok: false`, never as an empty
 * (and therefore silently permissive) lineage.
 */
export async function getEffectiveCanonicalLineage(
  reader: LineageKvReader = defaultReader,
): Promise<EffectiveCanonicalLineage> {
  let activeVersion: unknown;
  try {
    activeVersion = await reader(LINEAGE_ACTIVE_VERSION_KEY);
  } catch (error) {
    return {
      ok: false,
      active_version: null,
      reason: 'read_error',
      detail: `failed to read ${LINEAGE_ACTIVE_VERSION_KEY}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (typeof activeVersion !== 'string' || activeVersion.length === 0) {
    return {
      ok: false,
      active_version: null,
      reason: 'no_active_version',
      detail: `${LINEAGE_ACTIVE_VERSION_KEY} is not set`,
    };
  }

  let manifestRaw: unknown;
  let canonicalRaw: unknown;
  let quarantineRaw: unknown;
  try {
    [manifestRaw, canonicalRaw, quarantineRaw] = await Promise.all([
      reader(versionedManifestKey(activeVersion)),
      reader(versionedCanonicalKey(activeVersion)),
      reader(versionedQuarantineKey(activeVersion)),
    ]);
  } catch (error) {
    return {
      ok: false,
      active_version: activeVersion,
      reason: 'read_error',
      detail: `failed to read versioned lineage keys: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (manifestRaw === null || manifestRaw === undefined) {
    return {
      ok: false,
      active_version: activeVersion,
      reason: 'manifest_missing',
      detail: `missing key ${versionedManifestKey(activeVersion)}`,
    };
  }
  if (!isPlainObject(manifestRaw)) {
    return {
      ok: false,
      active_version: activeVersion,
      reason: 'manifest_malformed',
      detail: 'staged manifest is not a JSON object',
    };
  }
  const manifest = manifestRaw as unknown as CollisionRepairBatchManifest;
  let manifestHashValid: boolean;
  try {
    manifestHashValid = verifyManifestHash(manifest);
  } catch (error) {
    // A malformed-but-object-shaped manifest (e.g. missing `receipts`) can throw
    // inside hash computation rather than simply failing the comparison. That
    // must fail closed the same as a mismatch, never propagate and abort the
    // caller before it persists a fresh (degraded) watchdog report.
    return {
      ok: false,
      active_version: activeVersion,
      reason: 'manifest_malformed',
      detail: `manifest hash verification threw: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!manifestHashValid) {
    return {
      ok: false,
      active_version: activeVersion,
      reason: 'manifest_hash_mismatch',
      detail: 'staged manifest checksum verification failed',
    };
  }

  if (canonicalRaw === null || canonicalRaw === undefined) {
    return {
      ok: false,
      active_version: activeVersion,
      reason: 'canonical_map_missing',
      detail: `missing key ${versionedCanonicalKey(activeVersion)}`,
    };
  }
  if (!isPlainObject(canonicalRaw)) {
    return {
      ok: false,
      active_version: activeVersion,
      reason: 'canonical_map_malformed',
      detail: 'staged canonical map is not a JSON object',
    };
  }

  if (quarantineRaw === null || quarantineRaw === undefined) {
    return {
      ok: false,
      active_version: activeVersion,
      reason: 'quarantine_list_missing',
      detail: `missing key ${versionedQuarantineKey(activeVersion)}`,
    };
  }
  if (!Array.isArray(quarantineRaw) || quarantineRaw.some((id) => typeof id !== 'string')) {
    return {
      ok: false,
      active_version: activeVersion,
      reason: 'quarantine_list_malformed',
      detail: 'staged quarantine list is not a string array',
    };
  }

  // The manifest hash only proves the manifest object itself is unmodified —
  // canonicalRaw/quarantineRaw are read from two SEPARATE KV keys and are not
  // covered by that hash. A stale, partially-written, or tampered side-car key
  // could otherwise select a different canonical winner while the manifest
  // hash still checks out. Bind both back to the verified manifest's own
  // canonical_assignments/quarantined_seal_ids before trusting them.
  const manifestCanonical = manifest.canonical_assignments ?? {};
  const canonicalRawObj = canonicalRaw as Record<string, string>;
  const manifestCanonicalKeys = Object.keys(manifestCanonical).sort();
  const canonicalRawKeys = Object.keys(canonicalRawObj).sort();
  const canonicalMatchesManifest =
    manifestCanonicalKeys.length === canonicalRawKeys.length &&
    manifestCanonicalKeys.every(
      (key, i) => key === canonicalRawKeys[i] && manifestCanonical[key] === canonicalRawObj[key],
    );
  if (!canonicalMatchesManifest) {
    return {
      ok: false,
      active_version: activeVersion,
      reason: 'canonical_map_manifest_mismatch',
      detail: `staged canonical map at ${versionedCanonicalKey(activeVersion)} does not match the verified manifest's canonical_assignments`,
    };
  }

  const manifestQuarantine = [...(manifest.quarantined_seal_ids ?? [])].sort();
  const quarantineRawSorted = [...(quarantineRaw as string[])].sort();
  const quarantineMatchesManifest =
    manifestQuarantine.length === quarantineRawSorted.length &&
    manifestQuarantine.every((id, i) => id === quarantineRawSorted[i]);
  if (!quarantineMatchesManifest) {
    return {
      ok: false,
      active_version: activeVersion,
      reason: 'quarantine_list_manifest_mismatch',
      detail: `staged quarantine list at ${versionedQuarantineKey(activeVersion)} does not match the verified manifest's quarantined_seal_ids`,
    };
  }

  const canonical_index: CanonicalIndexSnapshot = new Map();
  for (const [blockKey, sealId] of Object.entries(canonicalRaw)) {
    const blockNumber = Number(blockKey);
    if (!Number.isInteger(blockNumber) || typeof sealId !== 'string') {
      return {
        ok: false,
        active_version: activeVersion,
        reason: 'canonical_map_malformed',
        detail: `invalid canonical map entry: ${blockKey} -> ${String(sealId)}`,
      };
    }
    canonical_index.set(blockNumber, sealId);
  }

  return {
    ok: true,
    active_version: activeVersion,
    canonical_index,
    quarantined: new Set(quarantineRaw as string[]),
    manifest,
  };
}
