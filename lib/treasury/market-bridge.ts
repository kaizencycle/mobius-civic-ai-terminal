import { getTreasuryAlerts } from './alerts';
import { getTreasuryCrossCheck } from './cross-check';
import { getTreasuryWatchSnapshot } from './watch';

export type TreasuryMarketBridgePayload = {
  timestamp: string;
  regime: 'nominal' | 'watch' | 'stressed' | 'critical';
  marketSignal: 'supportive' | 'neutral' | 'cautious' | 'risk-off';
  summary: string;
  takeaways: string[];
  metrics: {
    debtPerDay: number;
    debtPerSecond: number;
    freshness: 'fresh' | 'degraded' | 'stale';
    crossCheck: 'aligned' | 'watch' | 'drift' | 'partial';
    fiscalAlertCount: number;
  };
};

const CACHE_TTL_MS = 60 * 1000;
let cached: { at: number; payload: TreasuryMarketBridgePayload } | null = null;

function canonicalNow() {
  return new Date().toISOString();
}

export async function getTreasuryMarketBridge(): Promise<TreasuryMarketBridgePayload> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.payload;
  }

  const [watch, crossCheck, alerts] = await Promise.all([
    getTreasuryWatchSnapshot(),
    getTreasuryCrossCheck(),
    getTreasuryAlerts(),
  ]);

  const fiscalAlertCount = alerts.tripwires.length + alerts.alerts.length;

  let regime: TreasuryMarketBridgePayload['regime'] = 'nominal';
  let marketSignal: TreasuryMarketBridgePayload['marketSignal'] = 'supportive';

  if (watch.stress.status === 'critical' || crossCheck.status === 'drift') {
    regime = 'critical';
    marketSignal = 'risk-off';
  } else if (watch.stress.status === 'stressed' || crossCheck.status === 'partial') {
    regime = 'stressed';
    marketSignal = 'cautious';
  } else if (watch.stress.status === 'watch' || watch.freshness.state !== 'fresh') {
    regime = 'watch';
    marketSignal = 'neutral';
  }

  const takeaways: string[] = [];

  if (watch.delta7dAvg > 0 && watch.delta1d > watch.delta7dAvg * 1.15) {
    takeaways.push('Debt velocity is running above the recent 7d baseline.');
  } else {
    takeaways.push('Debt velocity is broadly within the recent range.');
  }

  if (watch.freshness.state !== 'fresh' || watch.provenance.fallbackUsed) {
    takeaways.push('Treasury source freshness is degraded; interpret motion cautiously.');
  } else {
    takeaways.push('Treasury source freshness is stable.');
  }

  if (crossCheck.status === 'drift') {
    takeaways.push('Monthly MSPD vs Schedules drift is active.');
  } else if (crossCheck.status === 'partial') {
    takeaways.push('Monthly cross-check is only partially aligned.');
  } else {
    takeaways.push('Monthly cross-check is aligned.');
  }

  if (fiscalAlertCount > 0) {
    takeaways.push(`${fiscalAlertCount} fiscal alert engine output${fiscalAlertCount === 1 ? '' : 's'} active.`);
  }

  const summary =
    regime === 'critical'
      ? 'Treasury posture is feeding a risk-off fiscal signal into the Markets chamber.'
      : regime === 'stressed'
        ? 'Treasury posture is feeding a cautious fiscal signal into the Markets chamber.'
        : regime === 'watch'
          ? 'Treasury posture is in watch mode but not yet a full market stress impulse.'
          : 'Treasury posture is currently neutral for the Markets chamber.';

  const payload: TreasuryMarketBridgePayload = {
    timestamp: canonicalNow(),
    regime,
    marketSignal,
    summary,
    takeaways,
    metrics: {
      debtPerDay: watch.delta1d,
      debtPerSecond: watch.ratePerSecond,
      freshness: watch.freshness.state,
      crossCheck: crossCheck.status,
      fiscalAlertCount,
    },
  };

  cached = { at: now, payload };
  return payload;
}
