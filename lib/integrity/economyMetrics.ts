/**
 * C-384 PR-4 — live MIC/MII metrics for integrity surfaces (no lib/mock fixtures).
 *
 * `mic_supply` = attested circulation supply (unavailable until a mint/seal source is wired).
 * `totalMicProvisional` = ECHO reward accounting only (not supply).
 */

import { currentCycleId } from '@/lib/eve/cycle-engine';
import type { CycleIntegritySummary } from '@/lib/echo/integrity-engine';
import { getEchoIntegrity } from '@/lib/echo/store';
import { readMiiFeed } from '@/lib/kv/mii';
import { kvGet } from '@/lib/kv/store';

export type EconomyMetricSource = 'echo' | 'kv' | 'mii-feed' | 'unavailable';

export type MicCycleTotalsKv = {
  cycle?: string;
  totalMicProvisional?: number;
  totalMicMinted?: number;
  updatedAt?: string;
};

export type MicSupplyResolved = {
  mic_supply: number | null;
  mic_supply_source: EconomyMetricSource;
};

export type MiiBaselineResolved = {
  mii_baseline: number | null;
  mii_baseline_source: EconomyMetricSource;
};

export type EchoMicProvisionalResolved = {
  totalMicProvisional: number | null;
  totalMicMinted: number | null;
  mic_provisional_source: EconomyMetricSource;
};

/** Attested circulation MIC — not provisional ECHO rewards (see integrity-engine.ts). */
export async function resolveMicSupply(): Promise<MicSupplyResolved> {
  return { mic_supply: null, mic_supply_source: 'unavailable' };
}

export function provisionalFromEchoIntegrity(
  integrity: CycleIntegritySummary | null,
  cycleId: string,
): EchoMicProvisionalResolved | null {
  if (!integrity || integrity.cycleId !== cycleId) return null;
  const v = integrity.totalMicProvisional ?? integrity.totalMicMinted ?? 0;
  return {
    totalMicProvisional: v,
    totalMicMinted: integrity.totalMicMinted ?? v,
    mic_provisional_source: 'echo',
  };
}

export function provisionalFromKvTotals(
  kv: MicCycleTotalsKv | null | undefined,
  cycleId: string,
): EchoMicProvisionalResolved | null {
  if (!kv || kv.cycle !== cycleId) return null;
  const v = kv.totalMicProvisional ?? kv.totalMicMinted ?? 0;
  return {
    totalMicProvisional: v,
    totalMicMinted: kv.totalMicMinted ?? v,
    mic_provisional_source: 'kv',
  };
}

/** Provisional MIC reward totals for the current cycle only. */
export async function resolveEchoMicProvisionalFields(): Promise<EchoMicProvisionalResolved> {
  const cycleId = currentCycleId();
  const fromEcho = provisionalFromEchoIntegrity(getEchoIntegrity(), cycleId);
  if (fromEcho) return fromEcho;

  try {
    const kv = await kvGet<MicCycleTotalsKv>('mic:cycle:totals');
    const fromKv = provisionalFromKvTotals(kv, cycleId);
    if (fromKv) return fromKv;
  } catch {
    // fall through
  }

  return {
    totalMicProvisional: null,
    totalMicMinted: null,
    mic_provisional_source: 'unavailable',
  };
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

export type IntegrityEconomySnapshot = MicSupplyResolved &
  MiiBaselineResolved &
  EchoMicProvisionalResolved;

/** Single read snapshot for buildStatus + integrity-status (no split MIC fields). */
export async function resolveIntegrityEconomySnapshot(): Promise<IntegrityEconomySnapshot> {
  const [micSupply, mii, provisional] = await Promise.all([
    resolveMicSupply(),
    resolveMiiBaseline(),
    resolveEchoMicProvisionalFields(),
  ]);
  return { ...micSupply, ...mii, ...provisional };
}

/** @deprecated use resolveIntegrityEconomySnapshot */
export async function resolveIntegrityEconomyMetrics(): Promise<IntegrityEconomySnapshot> {
  return resolveIntegrityEconomySnapshot();
}
