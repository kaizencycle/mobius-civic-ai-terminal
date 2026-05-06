import type { DalResult } from '@/lib/dal/types';
import { degradedDalResult, okDalResult, nowIso } from '@/lib/dal/types';
import { readVaultDalSnapshot } from '@/lib/dal/vault';

export type TerminalDalSnapshot = {
  cycle: string;
  degraded: boolean;
  vault: {
    ok: boolean;
    headline: string | null;
  };
  generated_at: string;
};

/**
 * Phase 1 additive snapshot DAL.
 *
 * This is NOT wired into /api/terminal/snapshot yet.
 *
 * Purpose:
 * establish canonical aggregation boundaries before migration.
 */
export async function buildTerminalDalSnapshot(
  cycle = 'C-303',
): Promise<DalResult<TerminalDalSnapshot>> {
  try {
    const vault = await readVaultDalSnapshot(null);

    const degraded = !vault.ok;

    return okDalResult(
      {
        cycle,
        degraded,
        vault: {
          ok: vault.ok,
          headline: vault.data?.headline ?? null,
        },
        generated_at: nowIso(),
      },
      {
        source: 'computed',
        freshness: degraded ? 'stale' : 'live',
        timestamp: nowIso(),
        note: 'Additive DAL aggregate scaffold',
      },
    );
  } catch (error) {
    return degradedDalResult<TerminalDalSnapshot>({
      source: 'fallback',
      error: error instanceof Error ? error.message : 'unknown_snapshot_dal_error',
      note: 'Snapshot DAL scaffold failed during additive phase',
    });
  }
}
