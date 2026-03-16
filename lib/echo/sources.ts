/**
 * ECHO Source Fetchers
 *
 * Free, no-auth public APIs that ECHO ingests every 2 hours.
 * Each source returns a normalized array of raw events.
 */

// ── Types ────────────────────────────────────────────────────

export type RawEvent = {
  sourceId: string;
  source: string;
  title: string;
  summary: string;
  url: string;
  timestamp: string;
  category: 'geopolitical' | 'market' | 'infrastructure' | 'governance';
  severity: 'low' | 'medium' | 'high';
  metadata: Record<string, unknown>;
};

// ── GDELT — Global Event Database ────────────────────────────
// Docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
// No auth required, returns global news events.

export async function fetchGDELT(): Promise<RawEvent[]> {
  const url =
    'https://api.gdeltproject.org/api/v2/doc/doc?query=conflict%20OR%20sanctions%20OR%20election%20OR%20diplomacy&mode=ArtList&maxrecords=10&format=json&sort=DateDesc';

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];

    const data = await res.json();
    const articles: Array<{
      title?: string;
      seendate?: string;
      url?: string;
      domain?: string;
      socialimage?: string;
    }> = data?.articles ?? [];

    return articles.slice(0, 8).map((a, i) => ({
      sourceId: `gdelt-${Date.now()}-${i}`,
      source: 'GDELT',
      title: a.title ?? 'Untitled event',
      summary: `Global event detected via ${a.domain ?? 'unknown source'}. Tracked by GDELT real-time monitor.`,
      url: a.url ?? '',
      timestamp: a.seendate
        ? new Date(a.seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')).toISOString()
        : new Date().toISOString(),
      category: 'geopolitical' as const,
      severity: 'medium' as const,
      metadata: { domain: a.domain, image: a.socialimage },
    }));
  } catch {
    return [];
  }
}

// ── USGS — Earthquake Hazards ────────────────────────────────
// Docs: https://earthquake.usgs.gov/fdsnws/event/1/
// Returns significant earthquakes in the last 24 hours.

export async function fetchUSGS(): Promise<RawEvent[]> {
  const url =
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];

    const data = await res.json();
    const features: Array<{
      properties: {
        title?: string;
        place?: string;
        mag?: number;
        time?: number;
        url?: string;
        alert?: string;
        tsunami?: number;
      };
      id: string;
    }> = data?.features ?? [];

    return features.slice(0, 6).map((f) => {
      const mag = f.properties.mag ?? 0;
      const severity: RawEvent['severity'] =
        mag >= 6 ? 'high' : mag >= 4 ? 'medium' : 'low';

      return {
        sourceId: `usgs-${f.id}`,
        source: 'USGS',
        title: f.properties.title ?? 'Seismic event detected',
        summary: `M${mag.toFixed(1)} earthquake near ${f.properties.place ?? 'unknown location'}. ${f.properties.tsunami ? 'Tsunami alert issued.' : 'No tsunami warning.'}`,
        url: f.properties.url ?? '',
        timestamp: f.properties.time
          ? new Date(f.properties.time).toISOString()
          : new Date().toISOString(),
        category: 'infrastructure' as const,
        severity,
        metadata: {
          magnitude: mag,
          alert: f.properties.alert,
          tsunami: f.properties.tsunami,
        },
      };
    });
  } catch {
    return [];
  }
}

// ── CoinGecko — Crypto Market Data ───────────────────────────
// Docs: https://docs.coingecko.com/reference/introduction
// Free tier: 30 calls/min, no auth required.

export async function fetchCoinGecko(): Promise<RawEvent[]> {
  const url =
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true';

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];

    const data: Record<
      string,
      { usd?: number; usd_24h_change?: number; last_updated_at?: number }
    > = await res.json();

    return Object.entries(data).map(([coin, info]) => {
      const change = info.usd_24h_change ?? 0;
      const severity: RawEvent['severity'] =
        Math.abs(change) > 8 ? 'high' : Math.abs(change) > 3 ? 'medium' : 'low';

      return {
        sourceId: `coingecko-${coin}-${Date.now()}`,
        source: 'CoinGecko',
        title: `${coin.toUpperCase()} ${change >= 0 ? '▲' : '▼'} $${(info.usd ?? 0).toLocaleString()} (${change >= 0 ? '+' : ''}${change.toFixed(1)}%)`,
        summary: `${coin.charAt(0).toUpperCase() + coin.slice(1)} trading at $${(info.usd ?? 0).toLocaleString()} USD with a ${Math.abs(change).toFixed(1)}% ${change >= 0 ? 'gain' : 'loss'} in the last 24 hours.`,
        url: `https://www.coingecko.com/en/coins/${coin}`,
        timestamp: info.last_updated_at
          ? new Date(info.last_updated_at * 1000).toISOString()
          : new Date().toISOString(),
        category: 'market' as const,
        severity,
        metadata: { coin, price: info.usd, change24h: change },
      };
    });
  } catch {
    return [];
  }
}

// ── Aggregate all sources ────────────────────────────────────

export async function fetchAllSources(): Promise<RawEvent[]> {
  const [gdelt, usgs, coingecko] = await Promise.allSettled([
    fetchGDELT(),
    fetchUSGS(),
    fetchCoinGecko(),
  ]);

  const events: RawEvent[] = [
    ...(gdelt.status === 'fulfilled' ? gdelt.value : []),
    ...(usgs.status === 'fulfilled' ? usgs.value : []),
    ...(coingecko.status === 'fulfilled' ? coingecko.value : []),
  ];

  // Sort by timestamp descending (most recent first)
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return events;
}
