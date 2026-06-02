import { summarizeMicroAnomalies } from '@/lib/agents/sentinel-cycle-journals';
import type { DalResult } from '@/lib/dal/types';
import { degradedDalResult, okDalResult, nowIso } from '@/lib/dal/types';

export type SentinelDalSnapshot = {
  anomaly_count: number;
  anomaly_labels: string[];
  /** Phase 7 severity seed: nominal/watch/warning. */
  posture: 'nominal' | 'watch' | 'warning';
  timestamp: string;
};

/**
 * C-303 Phase 1 — Sentinel DAL reader (seeds Phase 7 severity language).
 * Additive scaffold. Wraps the canonical micro-anomaly summarizer so chambers
 * can read sentinel posture without self-fetch.
 */
export async function readSentinelDalSnapshot(): Promise<DalResult<SentinelDalSnapshot>> {
  try {
    const { count, labels } = await summarizeMicroAnomalies();

    // Phase 7 severity seed — conservative; thresholds can be tuned in P7.
    const posture: SentinelDalSnapshot['posture'] =
      count === 0 ? 'nominal' : count <= 2 ? 'watch' : 'warning';

    return okDalResult(
      {
        anomaly_count: count,
        anomaly_labels: labels,
        posture,
        timestamp: nowIso(),
      },
      {
        source: 'computed',
        freshness: 'live',
        timestamp: nowIso(),
        note: 'Sentinel DAL scaffold sourced from micro-anomaly summarizer',
      },
    );
  } catch (error) {
    return degradedDalResult<SentinelDalSnapshot>({
      source: 'fallback',
      error: error instanceof Error ? error.message : 'unknown_sentinel_dal_error',
      note: 'Sentinel DAL scaffold degraded during additive extraction',
    });
  }
}
