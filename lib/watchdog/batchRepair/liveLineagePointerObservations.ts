import { getLatestSealIdPrimaryOnly, getWatchdogStringPrimaryOnly } from '@/lib/vault-v2/store';
import { LINEAGE_ACTIVE_VERSION_KEY } from '@/lib/watchdog/batchRepair/versionedStaging';

export type LiveLineagePointerObservations = {
  ok: boolean;
  errors: string[];
  active_lineage_version: string | null;
  live_canonical_pointer: string | null;
};

/** When no active version is set, canonical pointer remains unresolved (null). */
export function resolveLiveCanonicalPointerForCas(args: {
  active_lineage_version: string | null;
  primary_latest_seal_id: string | null;
}): { ok: boolean; value: string | null; errors: string[] } {
  if (!args.active_lineage_version) {
    return { ok: true, value: null, errors: [] };
  }
  if (!args.primary_latest_seal_id) {
    return {
      ok: false,
      value: null,
      errors: [
        'active lineage version is set in primary KV but vault:seal:latest canonical pointer is unavailable',
      ],
    };
  }
  return { ok: true, value: args.primary_latest_seal_id, errors: [] };
}

export async function loadLiveLineagePointerObservationsPrimaryOnly(): Promise<LiveLineagePointerObservations> {
  const activeRead = await getWatchdogStringPrimaryOnly(LINEAGE_ACTIVE_VERSION_KEY);
  if (!activeRead.read_ok) {
    return {
      ok: false,
      errors: [
        `failed to read ${LINEAGE_ACTIVE_VERSION_KEY} from primary KV: ${activeRead.error ?? 'unknown error'}`,
      ],
      active_lineage_version: null,
      live_canonical_pointer: null,
    };
  }

  const active_lineage_version = activeRead.value;
  const primaryLatestSealId = active_lineage_version ? await getLatestSealIdPrimaryOnly() : null;
  const canonical = resolveLiveCanonicalPointerForCas({
    active_lineage_version,
    primary_latest_seal_id: primaryLatestSealId,
  });

  return {
    ok: canonical.ok,
    errors: canonical.errors,
    active_lineage_version,
    live_canonical_pointer: canonical.value,
  };
}
