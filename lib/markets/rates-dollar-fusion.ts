import { getCanonicalMacroOverlay } from '@/lib/markets/macro-overlay';
import { getTreasuryAlerts } from '@/lib/treasury/alerts';
import { getTreasuryMarketBridge } from '@/lib/treasury/market-bridge';

export type RatesDollarFusionPayload = {
  timestamp: string;
  regime: 'nominal' | 'watch' | 'stressed' | 'critical';
  marketSignal: 'supportive' | 'neutral' | 'cautious' | 'risk-off';
  summary: string;
  takeaways: string[];
  overlays: {
    source: string;
    provider: string;
    asOf: string | null;
    tenYearYield: number | null;
    thirtyYearYield: number | null;
    dxy: number | null;
    vix: number | null;
    available: boolean;
  };
  treasury: {
    debtPerDay: number;
    debtPerSecond: number;
    freshness: 'fresh' | 'degraded' | 'stale';
    crossCheck: 'aligned' | 'watch' | 'drift' | 'partial';
    fiscalAlertCount: number;
  };
};

const CACHE_TTL_MS = 60 * 1000;
let cached: { at: number; payload: RatesDollarFusionPayload } | null = null;

function canonicalNow() {
  return new Date().toISOString();
}

export async function getRatesDollarFusion(): Promise<RatesDollarFusionPayload> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.payload;
  }

  const [treasuryBridge, treasuryAlerts, external] = await Promise.all([
    getTreasuryMarketBridge(),
    getTreasuryAlerts(),
    getCanonicalMacroOverlay(),
  ]);

  let regime: RatesDollarFusionPayload['regime'] = treasuryBridge.regime;
  let marketSignal: RatesDollarFusionPayload['marketSignal'] = treasuryBridge.marketSignal;
  const takeaways = [...treasuryBridge.takeaways];

  const fiscalAlertCount = treasuryAlerts.tripwires.length + treasuryAlerts.alerts.length;

  const tenYearYield = external.tenYearYield;
  const thirtyYearYield = external.thirtyYearYield;
  const dxy = external.dxy;
  const vix = external.vix;

  if (tenYearYield !== null && thirtyYearYield !== null) {
    if (tenYearYield >= 4.5 || thirtyYearYield >= 5.0) {
      regime = regime === 'critical' ? 'critical' : 'stressed';
      marketSignal = marketSignal === 'risk-off' ? 'risk-off' : 'cautious';
      takeaways.push('Long-end rates are elevated relative to a calm baseline.');
    } else {
      takeaways.push('Long-end rates are not flashing an extra stress override.');
    }
  } else {
    takeaways.push('External long-end rate overlay unavailable.');
  }

  if (dxy !== null) {
    if (dxy >= 106) {
      takeaways.push('Dollar strength is firm enough to tighten macro conditions.');
    } else if (dxy <= 100) {
      takeaways.push('Dollar is softer, reducing some immediate macro tightness.');
    } else {
      takeaways.push('Dollar posture is neutral-to-firm.');
    }
  } else {
    takeaways.push('Dollar overlay unavailable.');
  }

  if (vix !== null) {
    if (vix >= 25) {
      regime = regime === 'critical' ? 'critical' : 'stressed';
      marketSignal = 'risk-off';
      takeaways.push('Volatility is elevated enough to reinforce a risk-off read.');
    } else if (vix >= 18) {
      takeaways.push('Volatility is elevated but not panic-grade.');
    } else {
      takeaways.push('Volatility is broadly contained.');
    }
  } else {
    takeaways.push('Volatility overlay unavailable.');
  }

  const summary =
    marketSignal === 'risk-off'
      ? 'Treasury, rates, dollar, and volatility are combining into a risk-off market posture.'
      : marketSignal === 'cautious'
        ? 'Treasury posture is leaning cautious once macro overlays are fused in.'
        : marketSignal === 'neutral'
          ? 'Treasury posture is not yet forcing a full market stress signal.'
          : 'Treasury posture is supportive for the current market surface.';

  const payload: RatesDollarFusionPayload = {
    timestamp: canonicalNow(),
    regime,
    marketSignal,
    summary,
    takeaways,
    overlays: {
      source: external.source,
      provider: external.provider,
      asOf: external.asOf,
      tenYearYield,
      thirtyYearYield,
      dxy,
      vix,
      available: external.available,
    },
    treasury: {
      debtPerDay: treasuryBridge.metrics.debtPerDay,
      debtPerSecond: treasuryBridge.metrics.debtPerSecond,
      freshness: treasuryBridge.metrics.freshness,
      crossCheck: treasuryBridge.metrics.crossCheck,
      fiscalAlertCount,
    },
  };

  cached = { at: now, payload };
  return payload;
}
