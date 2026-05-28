'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchMarketSignals, gatedConfidence, MOCK_MARKET_SIGNALS } from '@/lib/terminal/markets';
import type { MarketSignal, SignalCategory } from '@/lib/terminal/markets';
import { fetchTripwires } from '@/lib/terminal/tripwire';
import type { TripwireEntry } from '@/lib/terminal/tripwire';
import { fetchIntegrity } from '@/lib/terminal/integrity';
import { MarketsCorrelation } from './MarketsCorrelation';
import { MarketsFreshnessTicker } from './MarketsFreshnessTicker';

const CAT_STYLE: Record<SignalCategory, string> = {
  MACRO:      'bg-sky-950 text-sky-300 border border-sky-800',
  CRYPTO:     'bg-violet-950 text-violet-300 border border-violet-800',
  GOVERNANCE: 'bg-emerald-950 text-emerald-300 border border-emerald-800',
  SOVEREIGN:  'bg-amber-950 text-amber-300 border border-amber-800',
};

type TabId = 'signals' | 'correlation';

export default function MarketsChamber() {
  const router = useRouter();
  const [signals, setSignals]     = useState<MarketSignal[]>([]);
  const [gi, setGi]               = useState<number | null>(null);
  const [tripwires, setTripwires] = useState<TripwireEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<TabId>('signals');

  useEffect(() => {
    // G-03: 2s client-side fallback so mock renders immediately if API is slow
    const fallback = setTimeout(() => {
      setSignals((prev) => (prev.length > 0 ? prev : MOCK_MARKET_SIGNALS));
      setLoading(false);
    }, 2000);

    Promise.all([
      fetchMarketSignals(),
      fetchIntegrity(),
      fetchTripwires(),
    ])
      .then(([sigs, integrity, tw]) => {
        clearTimeout(fallback);
        setSignals(sigs);
        setGi(integrity.gi);
        setTripwires(tw.filter((t) => !t.resolved));
        setLoading(false);
      })
      .catch(() => {
        clearTimeout(fallback);
        setSignals(MOCK_MARKET_SIGNALS);
        setLoading(false);
      });

    return () => clearTimeout(fallback);
  }, []);

  if (loading) return (
    <div className="p-6 font-mono text-amber-400 text-xs animate-pulse">
      MARKETS · loading signals…
    </div>
  );

  const giLabel =
    gi === null     ? null :
    gi >= 0.75      ? 'SIGNALS TRUSTED' :
    gi >= 0.65      ? 'SIGNALS CAUTIOUS' :
    'SIGNALS GATED';

  const giBadgeClass =
    gi === null     ? '' :
    gi >= 0.75      ? 'bg-green-950 border-green-800 text-green-300' :
    gi >= 0.65      ? 'bg-amber-950 border-amber-800 text-amber-300' :
    'bg-red-950 border-red-800 text-red-300';

  return (
    <div className="flex flex-col h-full font-mono text-xs">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <span className="text-sky-400 font-bold tracking-widest">◈ MARKETS</span>
        {gi !== null && (
          <span className={`text-[10px] px-2 py-0.5 rounded border ${giBadgeClass}`}>
            GI {gi.toFixed(2)} · {giLabel}
          </span>
        )}
        <div className="flex gap-1 ml-auto">
          {(['signals', 'correlation'] as TabId[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-0.5 rounded border text-[10px] transition-colors ${
                tab === t
                  ? 'bg-sky-950 border-sky-700 text-sky-300'
                  : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Tripwire cross-ref banner (MK-04) */}
      {tripwires.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-950/40 border-b border-amber-800/40 text-[10px] font-mono">
          <span className="text-amber-400">⚡</span>
          <span className="text-amber-300">
            {tripwires.length} active anomal{tripwires.length === 1 ? 'y' : 'ies'} affecting signal confidence
          </span>
          <button
            type="button"
            onClick={() => router.push('/terminal/tripwire')}
            className="ml-auto text-amber-500 hover:text-amber-300 underline transition-colors"
          >
            VIEW TRIPWIRE →
          </button>
        </div>
      )}

      {tab === 'signals' && (
        <>
          {/* Freshness ticker (MK-03) */}
          <MarketsFreshnessTicker signals={signals} />

          {/* Signal table (MK-01) */}
          <div className="flex-1 overflow-y-auto">
            {signals.map((sig) => {
              const conf = gatedConfidence(sig, gi);
              const confColor =
                conf >= 0.80 ? 'text-green-400' :
                conf >= 0.60 ? 'text-amber-400' :
                'text-red-400';
              const deltaColor =
                sig.deltaDir === 'up'   ? 'text-green-400' :
                sig.deltaDir === 'down' ? 'text-red-400' :
                'text-zinc-400';
              const isGated = sig.integrityWeight > 0.5 && gi !== null && gi < 0.75;
              return (
                <div
                  key={sig.id}
                  className="px-4 py-3 border-b border-zinc-800/60 hover:bg-zinc-900 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${CAT_STYLE[sig.category]}`}>
                      {sig.category}
                    </span>
                    <span className="text-zinc-100 font-medium">{sig.label}</span>
                    <span className={`ml-auto font-bold font-mono ${deltaColor}`}>
                      {sig.deltaDir === 'up' ? '▲' : sig.deltaDir === 'down' ? '▼' : '—'} {sig.value}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-500">
                    <span className="text-zinc-600 truncate">{sig.source}</span>
                    <span className="ml-auto flex-shrink-0">
                      CONF{' '}
                      <span className={confColor}>{(conf * 100).toFixed(0)}%</span>
                      {isGated && (
                        <span className="ml-1 text-amber-600">[GI-GATED]</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'correlation' && (
        <MarketsCorrelation signals={signals} gi={gi} />
      )}
    </div>
  );
}
