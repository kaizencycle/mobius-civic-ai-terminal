import { getTreasuryCrossCheck } from './cross-check';
import { getTreasuryDeepComposition } from './deep-composition';
import { getTreasuryWatchSnapshot } from './watch';

export type TreasuryAlertSeverity = 'low' | 'medium' | 'high';

export type TreasuryTripwire = {
  id: string;
  label: string;
  severity: TreasuryAlertSeverity;
  owner: 'ECHO';
  openedAt: string;
  action: string;
  layer: 'governance' | 'system' | 'market';
  category: 'integrity-drop' | 'institutional-trust' | 'volatility-spike' | 'source-credibility';
  autoDetected: true;
  triggerMetric: string;
  triggerThreshold?: number;
  triggerValue?: number;
  relatedEpicons?: string[];
};

export type TreasuryCivicAlert = {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'governance' | 'infrastructure' | 'manipulation';
  source: 'Treasury Watch';
  timestamp: string;
  impact: string;
  actions: string[];
};

type TreasuryAlertPayload = {
  timestamp: string;
  status: 'nominal' | 'watch' | 'stressed' | 'critical';
  tripwires: TreasuryTripwire[];
  alerts: TreasuryCivicAlert[];
};

const CACHE_TTL_MS = 60 * 1000;

let cachedPayload: TreasuryAlertPayload | null = null;
let cachedAt = 0;

function canonicalNow() {
  return new Date().toISOString();
}

function sortCanonically<T extends { openedAt?: string; timestamp?: string; severity?: string; label?: string; title?: string }>(
  items: T[],
) {
  const sevRank: Record<string, number> = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
    info: 5,
  };

  return [...items].sort((a, b) => {
    const aTs = new Date(a.openedAt ?? a.timestamp ?? 0).getTime();
    const bTs = new Date(b.openedAt ?? b.timestamp ?? 0).getTime();
    if (aTs !== bTs) return bTs - aTs;

    const aSev = sevRank[a.severity ?? 'info'] ?? 99;
    const bSev = sevRank[b.severity ?? 'info'] ?? 99;
    if (aSev !== bSev) return aSev - bSev;

    return (a.label ?? a.title ?? '').localeCompare(b.label ?? b.title ?? '');
  });
}

export async function getTreasuryAlerts(): Promise<TreasuryAlertPayload> {
  const now = Date.now();
  if (cachedPayload && now - cachedAt < CACHE_TTL_MS) {
    return cachedPayload;
  }

  const [watch, crossCheck, deep] = await Promise.all([
    getTreasuryWatchSnapshot(),
    getTreasuryCrossCheck(),
    getTreasuryDeepComposition(),
  ]);

  const timestamp = canonicalNow();
  const tripwires: TreasuryTripwire[] = [];
  const alerts: TreasuryCivicAlert[] = [];

  if (watch.delta7dAvg > 0 && watch.delta1d > watch.delta7dAvg * 1.15) {
    const highVelocity = watch.delta1d > watch.delta7dAvg * 1.35;
    tripwires.push({
      id: 'treasury-velocity-spike',
      label: 'Treasury debt velocity above 7d baseline',
      severity: highVelocity ? 'high' : 'medium',
      owner: 'ECHO',
      openedAt: timestamp,
      action: 'Review debt/day acceleration and stress posture',
      layer: 'market',
      category: 'volatility-spike',
      autoDetected: true,
      triggerMetric: 'delta1d_vs_delta7dAvg',
      triggerThreshold: watch.delta7dAvg * 1.15,
      triggerValue: watch.delta1d,
    });

    alerts.push({
      id: 'treasury-velocity-alert',
      title: 'Debt velocity rising above recent baseline',
      severity: highVelocity ? 'high' : 'medium',
      category: 'governance',
      source: 'Treasury Watch',
      timestamp,
      impact: 'Debt/day growth is exceeding the recent 7-day average.',
      actions: [
        'Inspect 30d velocity chart',
        'Review Treasury stress posture',
        'Track whether spike persists across next official update',
      ],
    });
  }

  if (watch.freshness.state !== 'fresh' || watch.provenance.fallbackUsed) {
    const stale = watch.freshness.state === 'stale';
    tripwires.push({
      id: 'treasury-source-stale',
      label: 'Treasury source freshness degraded',
      severity: stale ? 'high' : 'medium',
      owner: 'ECHO',
      openedAt: timestamp,
      action: 'Confirm Treasury source freshness and fallback state',
      layer: 'system',
      category: 'source-credibility',
      autoDetected: true,
      triggerMetric: 'freshness_state',
    });

    alerts.push({
      id: 'treasury-source-alert',
      title: 'Treasury Watch operating with degraded freshness',
      severity: stale ? 'high' : 'medium',
      category: 'infrastructure',
      source: 'Treasury Watch',
      timestamp,
      impact: `Source freshness is ${watch.freshness.state}${watch.provenance.fallbackUsed ? ` with fallback ${watch.provenance.fallbackUsed}` : ''}.`,
      actions: [
        'Verify official Treasury fetch path',
        'Inspect cache / fallback mode',
        'Treat interpolated motion as advisory only',
      ],
    });
  }

  if (crossCheck.status === 'drift' || crossCheck.status === 'partial') {
    const isDrift = crossCheck.status === 'drift';
    tripwires.push({
      id: 'treasury-cross-check-divergence',
      label: 'MSPD and Schedules monthly surfaces diverge',
      severity: isDrift ? 'high' : 'medium',
      owner: 'ECHO',
      openedAt: timestamp,
      action: 'Compare canonical monthly category totals',
      layer: 'governance',
      category: 'institutional-trust',
      autoDetected: true,
      triggerMetric: 'mspd_vs_schedules_pct_diff',
      triggerThreshold: crossCheck.tolerancePct,
      triggerValue: crossCheck.summary.pctDiff,
    });

    alerts.push({
      id: 'treasury-cross-check-alert',
      title: 'Monthly Treasury cross-check not aligned',
      severity: isDrift ? 'high' : 'medium',
      category: 'governance',
      source: 'Treasury Watch',
      timestamp,
      impact: `MSPD vs Schedules divergence is ${(crossCheck.summary.pctDiff * 100).toFixed(2)}%.`,
      actions: [
        'Inspect canonical category lines',
        'Verify dataset endpoint configuration',
        'Review missing or drifted classes',
      ],
    });
  }

  const largest = [...deep.categories].sort((a, b) => b.shareOfTotal - a.shareOfTotal)[0];
  if (largest && largest.shareOfTotal >= 0.35) {
    tripwires.push({
      id: 'treasury-composition-concentration',
      label: `${largest.label} dominates deep composition`,
      severity: largest.shareOfTotal >= 0.5 ? 'high' : 'low',
      owner: 'ECHO',
      openedAt: timestamp,
      action: 'Review monthly composition concentration',
      layer: 'governance',
      category: 'institutional-trust',
      autoDetected: true,
      triggerMetric: 'largest_category_share',
      triggerThreshold: 0.35,
      triggerValue: largest.shareOfTotal,
    });
  }

  const status =
    crossCheck.status === 'drift' || watch.stress.status === 'critical'
      ? 'critical'
      : watch.stress.status === 'stressed' || crossCheck.status === 'partial'
        ? 'stressed'
        : watch.stress.status === 'watch' || tripwires.length > 0
          ? 'watch'
          : 'nominal';

  const payload: TreasuryAlertPayload = {
    timestamp,
    status,
    tripwires: sortCanonically(tripwires),
    alerts: sortCanonically(alerts),
  };

  cachedPayload = payload;
  cachedAt = now;
  return payload;
}
