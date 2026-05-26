/**
 * Phase 02 (C-323): Market signal data layer with integrity-weighted confidence.
 * GI gates displayed confidence: conf × (1 − weight × (1 − gi))
 */

import { fetchInternal } from './api-client';

export type SignalCategory = 'MACRO' | 'CRYPTO' | 'GOVERNANCE' | 'SOVEREIGN';
export type SignalStatus = 'LIVE' | 'STALE' | 'UNVERIFIED' | 'GATED';

export interface MarketSignal {
  id: string;
  label: string;
  category: SignalCategory;
  value: string;
  delta: string;
  deltaDir: 'up' | 'down' | 'flat';
  integrityWeight: number;
  confidence: number;
  status: SignalStatus;
  source: string;
  cycle: string;
  ts: number;
}

export const MOCK_MARKET_SIGNALS: MarketSignal[] = [
  {
    id: 'mk-001',
    label: 'MIC / Integrity Coin',
    category: 'CRYPTO',
    value: '0.003 MIC',
    delta: '+0.001',
    deltaDir: 'up',
    integrityWeight: 1.0,
    confidence: 0.91,
    status: 'LIVE',
    source: 'Mobius Substrate ledger',
    cycle: 'C-323',
    ts: Date.now() - 900_000,
  },
  {
    id: 'mk-002',
    label: 'US 10Y Treasury Yield',
    category: 'SOVEREIGN',
    value: '4.41%',
    delta: '+0.03',
    deltaDir: 'up',
    integrityWeight: 0.70,
    confidence: 0.88,
    status: 'LIVE',
    source: 'FRED / St. Louis Fed',
    cycle: 'C-323',
    ts: Date.now() - 3_600_000,
  },
  {
    id: 'mk-003',
    label: 'BTC / USD',
    category: 'CRYPTO',
    value: '$94,210',
    delta: '-1.2%',
    deltaDir: 'down',
    integrityWeight: 0.45,
    confidence: 0.74,
    status: 'LIVE',
    source: 'CoinGecko',
    cycle: 'C-323',
    ts: Date.now() - 600_000,
  },
  {
    id: 'mk-004',
    label: 'EU AI Act Compliance Index',
    category: 'GOVERNANCE',
    value: '0.61',
    delta: '-0.04',
    deltaDir: 'down',
    integrityWeight: 0.90,
    confidence: 0.63,
    status: 'UNVERIFIED',
    source: 'EVE synthesis · C-322',
    cycle: 'C-322',
    ts: Date.now() - 86_400_000,
  },
];

function finvizRowToSignal(row: Record<string, unknown>, index: number): MarketSignal | null {
  const ticker =
    (typeof row.Ticker === 'string' && row.Ticker) ||
    (typeof row.ticker === 'string' && row.ticker);
  if (!ticker) return null;

  const price =
    typeof row.Price === 'string' ? row.Price :
    typeof row.price === 'string' ? row.price : '';
  const change =
    typeof row.Change === 'string' ? row.Change :
    typeof row.change === 'string' ? row.change : '0.00%';
  const deltaDir: 'up' | 'down' | 'flat' =
    change.startsWith('+') ? 'up' :
    change.startsWith('-') ? 'down' : 'flat';

  return {
    id: `finviz-${ticker}-${index}`,
    label: ticker,
    category: 'MACRO',
    value: price ? `$${price}` : '—',
    delta: change,
    deltaDir,
    integrityWeight: 0.50,
    confidence: 0.75,
    status: 'LIVE',
    source: 'Finviz screener',
    cycle: 'current',
    ts: Date.now(),
  };
}

export async function fetchMarketSignals(): Promise<MarketSignal[]> {
  const raw = await fetchInternal('/api/markets/finviz/signals');
  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    if (rec.ok && !rec.degraded) {
      const items = rec.items as {
        momentum?: Record<string, unknown>[];
        volatility?: Record<string, unknown>[];
        breadth?: Record<string, unknown>[];
      } | undefined;
      if (items) {
        const all = [
          ...(items.momentum ?? []),
          ...(items.volatility ?? []),
          ...(items.breadth ?? []),
        ].slice(0, 6);
        const signals = all
          .map((row, i) => finvizRowToSignal(row, i))
          .filter((s): s is MarketSignal => s !== null);
        if (signals.length > 0) return signals;
      }
    }
  }
  return MOCK_MARKET_SIGNALS;
}

export function gatedConfidence(signal: MarketSignal, gi: number | null): number {
  if (gi === null) return signal.confidence;
  return signal.confidence * (1 - signal.integrityWeight * (1 - gi));
}
