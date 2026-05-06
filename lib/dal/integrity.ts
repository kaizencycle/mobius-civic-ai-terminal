import { integrityStatus } from '@/lib/mock/integrityStatus';
import type { IntegrityStatusResponse } from '@/lib/mock/integrityStatus';
import type { DalResult } from '@/lib/dal/types';
import { degradedDalResult, okDalResult, nowIso } from '@/lib/dal/types';

export type IntegrityDalSnapshot = {
  cycle: string;
  global_integrity: number;
  mode: IntegrityStatusResponse['mode'];
  terminal_status: IntegrityStatusResponse['terminal_status'];
  summary: string;
  verified: boolean;
  degraded: boolean;
  timestamp: string;
};

/**
 * C-303 Phase 1D — additive integrity DAL scaffold.
 *
 * This is deliberately non-authoritative during Phase 1.
 * It establishes the typed boundary before live GI routing is migrated.
 */
export async function readIntegrityDalSnapshot(): Promise<DalResult<IntegrityDalSnapshot>> {
  try {
    return okDalResult(
      {
        cycle: integrityStatus.cycle,
        global_integrity: integrityStatus.global_integrity,
        mode: integrityStatus.mode,
        terminal_status: integrityStatus.terminal_status,
        summary: integrityStatus.summary,
        verified: integrityStatus.gi_verified ?? false,
        degraded: integrityStatus.degraded ?? true,
        timestamp: integrityStatus.timestamp,
      },
      {
        source: 'fallback',
        freshness: 'stale',
        timestamp: nowIso(),
        note: 'Non-authoritative integrity DAL scaffold; live GI migration pending',
      },
    );
  } catch (error) {
    return degradedDalResult<IntegrityDalSnapshot>({
      source: 'fallback',
      error: error instanceof Error ? error.message : 'unknown_integrity_dal_error',
      note: 'Integrity DAL scaffold failed during additive phase',
    });
  }
}
