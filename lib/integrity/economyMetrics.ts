/**
 * C-384 PR-4 — live MIC supply + MII baseline for integrity surfaces (no lib/mock fixtures).
 */

import { getEchoIntegrity } from '@/lib/echo/store';
import { readMiiFeed } from '@/lib/kv/mii';
import { kvGet } from '@/lib/kv/store';

export type EconomyMetricSource = 'echo' | 'kv' | 'mii-feed' | 'unavailable';

export type MicSupplyResolved = {
  mic_supply: number;
  mic_supply_source: EconomyMetricSource;
};

export type MiiBaselineResolved = {
  mii_baseline: number | null;
  mii_baseline_source: EconomyMetricSource;
};

/** Provisional MIC totals: ECHO in-memory first, then KV `mic:cycle:totals`. */
export async function resolveMicSupply(): Promise<MicSupplyResolved> {
  const i = getEchoIntegrity();
  const inMemory =
    i && typeof i.totalMicProvisional === 'number' && i.totalMicProvisional > 0
      ? i.totalMicProvisional
      : i && typeof i.totalMicMinted === 'number' && i.totalMicMinted > 0
        ? i.totalMicMinted
        : 0;

  if (inMemory > 0) {
    return { mic_supply: inMemory, mic_supply_source: 'echo' };
  }

  try {
    const kv = await kvGet<{ totalMicProvisional?: number; totalMicMinted?: number }>('mic:cycle:totals');
    const v = kv?.totalMicProvisional ?? kv?.totalMicMinted ?? 0;
    if (v > 0) {
      return { mic_supply: v, mic_supply_source: 'kv' };
    }
  } catch {
    // fall through
  }

  return { mic_supply: 0, mic_supply_source: 'unavailable' };
}

/** Mean of each agent's latest MII in the rolling feed; null when feed is empty. */
export async function resolveMiiBaseline(): Promise<MiiBaselineResolved> {
  try {
    const feed = await readMiiFeed(null, 200);
    const latestByAgent = new Map<string, number>();
    for (const entry of feed) {
      if (!latestByAgent.has(entry.agent)) {
        latestByAgent.set(entry.agent, entry.mii);
      }
    }
    if (latestByAgent.size === 0) {
      return { mii_baseline: null, mii_baseline_source: 'unavailable' };
    }
    const values = [...latestByAgent.values()];
    const avg = values.reduce((sum, n) => sum + n, 0) / values.length;
    return { mii_baseline: Number(avg.toFixed(4)), mii_baseline_source: 'mii-feed' };
  } catch {
    return { mii_baseline: null, mii_baseline_source: 'unavailable' };
  }
}

export async function resolveIntegrityEconomyMetrics(): Promise<MicSupplyResolved & MiiBaselineResolved> {
  const [mic, mii] = await Promise.all([resolveMicSupply(), resolveMiiBaseline()]);
  return { ...mic, ...mii };
}

/** Same numeric fields as integrity-status MIC spread (shared with routes). */
export async function resolveEchoMicProvisionalFields(): Promise<{
  totalMicProvisional: number;
  totalMicMinted: number;
}> {
  const { mic_supply } = await resolveMicSupply();
  return { totalMicProvisional: mic_supply, totalMicMinted: mic_supply };
}
