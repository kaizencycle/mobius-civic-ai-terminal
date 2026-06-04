import { getSubstrateStatusSummary } from '@/lib/substrate/client';
import type { DalResult } from '@/lib/dal/types';
import { degradedDalResult, okDalResult, nowIso } from '@/lib/dal/types';

export type LedgerDalSnapshot = {
  services_total: number;
  services_ok: number;
  services_degraded: string[];
  all_ok: boolean;
  timestamp: string;
};

/**
 * C-303 Phase 1 — Ledger DAL reader.
 * Additive scaffold. Wraps the canonical substrate service probe so chambers can
 * read ledger/substrate reachability without self-fetch. Reports per-service
 * health and surfaces degraded service names (feeds Phase 5 provenance).
 */
export async function readLedgerDalSnapshot(): Promise<DalResult<LedgerDalSnapshot>> {
  try {
    const summary = await getSubstrateStatusSummary();
    const services = summary.services ?? [];

    const degradedNames: string[] = [];
    let okCount = 0;
    for (const svc of services) {
      const healthy = (svc as { ok?: boolean; reachable?: boolean }).ok
        ?? (svc as { reachable?: boolean }).reachable
        ?? false;
      if (healthy) okCount += 1;
      else degradedNames.push((svc as { service?: string }).service ?? 'unknown');
    }

    const all_ok = services.length > 0 && okCount === services.length;

    return okDalResult(
      {
        services_total: services.length,
        services_ok: okCount,
        services_degraded: degradedNames,
        all_ok,
        timestamp: summary.timestamp ?? nowIso(),
      },
      {
        source: 'ledger',
        freshness: all_ok ? 'live' : 'stale',
        timestamp: summary.timestamp ?? nowIso(),
        note: 'Ledger DAL scaffold sourced from substrate status summary',
      },
    );
  } catch (error) {
    return degradedDalResult<LedgerDalSnapshot>({
      source: 'fallback',
      error: error instanceof Error ? error.message : 'unknown_ledger_dal_error',
      note: 'Ledger DAL scaffold degraded during additive extraction',
    });
  }
}
