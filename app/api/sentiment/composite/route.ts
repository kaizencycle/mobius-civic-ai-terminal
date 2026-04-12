import { NextResponse } from 'next/server';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { pollAllMicroAgents } from '@/lib/agents/micro';
import { isRedisAvailable, kvGet, kvSet } from '@/lib/kv/store';

type DomainKey = 'civic' | 'environ' | 'financial' | 'narrative' | 'infrastructure' | 'institutional';

type DomainPayload = {
  key: DomainKey;
  label: string;
  agent: string;
  score: number | null;
  sourceLabel: string;
};

type SentimentSnapshot = {
  cycle: string;
  timestamp: string;
  gi: number;
  overall_sentiment: number | null;
  domains: DomainPayload[];
};

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'SENTIMENT_SNAPSHOT';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mean(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (valid.length === 0) return null;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(3));
}

async function fetchCryptoComposite(): Promise<{ value: number | null; sourceLabel: string }> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true',
      { cache: 'no-store' },
    );
    if (!response.ok) return { value: null, sourceLabel: 'CoinGecko unavailable' };

    const data = (await response.json()) as Record<string, { usd_24h_change?: number }>;
    const changes = ['bitcoin', 'ethereum', 'solana']
      .map((asset) => data[asset]?.usd_24h_change)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));

    if (changes.length === 0) return { value: null, sourceLabel: 'CoinGecko no change data' };

    const avgChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;
    const value = clamp01((avgChange + 10) / 20);
    return {
      value: Number(value.toFixed(3)),
      sourceLabel: `Crypto 24h avg ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`,
    };
  } catch {
    // On failure, try reading the last known financial score from the KV snapshot
    // so the domain shows cached data rather than a null gap.
    if (isRedisAvailable()) {
      try {
        const cached = await kvGet<SentimentSnapshot>(CACHE_KEY);
        const financialDomain = cached?.domains?.find((d) => d.key === 'financial');
        if (typeof financialDomain?.score === 'number') {
          return { value: financialDomain.score, sourceLabel: 'Crypto (cached fallback)' };
        }
      } catch {
        // ignore — return null below
      }
    }
    return { value: null, sourceLabel: 'CoinGecko fetch failed' };
  }
}

export async function GET() {
  try {
    const [integrity, micro, financial] = await Promise.all([
      computeIntegrityPayload(),
      pollAllMicroAgents(),
      fetchCryptoComposite(),
    ]);

    const microByAgent = new Map(micro.agents.map((agent) => [agent.agentName, agent]));

    const gaiaScore = mean((microByAgent.get('GAIA')?.signals ?? []).map((signal) => signal.value));
    const hermesSignals = microByAgent.get('HERMES-µ')?.signals ?? [];
    const narrativeScore = mean(hermesSignals.map((signal) => signal.value));
    const hermesSources = hermesSignals.map((signal) => signal.source);
    const sonarEnabled = Boolean(process.env.PERPLEXITY_API_KEY);
    const daedalusScore = mean((microByAgent.get('DAEDALUS-µ')?.signals ?? []).map((signal) => signal.value));
    const themisSignals = microByAgent.get('THEMIS')?.signals ?? [];
    const civicScore = mean(themisSignals.map((signal) => signal.value));

    const domains: DomainPayload[] = [
      { key: 'civic', label: 'CIVIC', agent: 'EVE', score: civicScore, sourceLabel: 'Federal Register + Sonar civic' },
      { key: 'environ', label: 'ENVIRON', agent: 'GAIA', score: gaiaScore, sourceLabel: 'USGS + Open-Meteo + EONET' },
      { key: 'financial', label: 'FINANCIAL', agent: 'ECHO', score: financial.value, sourceLabel: financial.sourceLabel },
      {
        key: 'narrative',
        label: 'NARRATIVE',
        agent: 'HERMES',
        score: narrativeScore,
        sourceLabel: sonarEnabled
          ? hermesSources.includes('GDELT')
            ? 'HN + Wikipedia + Sonar + GDELT'
            : 'HN + Wikipedia + Sonar'
          : hermesSources.includes('GDELT')
            ? 'HN + Wikipedia + GDELT (Sonar unavailable)'
            : 'HN + Wikipedia (Sonar unavailable)',
      },
      { key: 'infrastructure', label: 'INFRASTR', agent: 'DAEDALUS', score: daedalusScore, sourceLabel: 'GitHub + npm + self-ping' },
      { key: 'institutional', label: 'INSTITUTIONAL', agent: 'JADE', score: civicScore, sourceLabel: 'data.gov + FRED (future)' },
    ];

    const weightedOverall = mean([
      domains.find((d) => d.key === 'civic')?.score ?? null,
      domains.find((d) => d.key === 'environ')?.score ?? null,
      domains.find((d) => d.key === 'financial')?.score ?? null,
      domains.find((d) => d.key === 'narrative')?.score ?? null,
      domains.find((d) => d.key === 'infrastructure')?.score ?? null,
      domains.find((d) => d.key === 'institutional')?.score ?? null,
    ]);

    const payload: SentimentSnapshot = {
      cycle: integrity.cycle,
      timestamp: new Date().toISOString(),
      gi: integrity.global_integrity,
      overall_sentiment: weightedOverall,
      domains,
    };

    if (isRedisAvailable()) {
      kvSet(CACHE_KEY, payload, 300).catch(() => {});
    }

    return NextResponse.json({ ok: true, ...payload }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'X-Mobius-Source': 'sentiment-composite-live',
      },
    });
  } catch {
    if (isRedisAvailable()) {
      const snapshot = await kvGet<SentimentSnapshot>(CACHE_KEY);
      if (snapshot) {
        return NextResponse.json({ ok: true, cached: true, ...snapshot }, {
          headers: { 'X-Mobius-Source': 'sentiment-composite-kv' },
        });
      }
    }

    return NextResponse.json({ ok: false, error: 'Sentiment composite unavailable' }, { status: 500 });
  }
}
