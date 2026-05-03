/**
 * ECHO Source Fetchers
 *
 * Free, no-auth public APIs that ECHO ingests every 2 hours.
 * Each source returns a normalized array of raw events.
 */

// ── Types ────────────────────────────────────────────────────

import { eveItemsToRawEvents, fetchEveGlobalNews } from '@/lib/eve/global-news';

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

// ── GovTrack — US Congress Legislative Activity ───────────────
// OPT-02 (C-296): Replaced dead GDELT source (3+ days returning 0).
// GovTrack RSS is free, no auth, returns real legislative activity.

export async function fetchGovTrack(): Promise<RawEvent[]> {
  const url = 'https://www.govtrack.us/events/govtrack.rss?feeds=misc:activebills';

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];

    const text = await res.text();
    const items = text.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

    // 0.15 floor: if feed is empty, return a sentinel low-signal event rather than []
    if (items.length === 0) {
      return [{
        sourceId: `govtrack-empty-${new Date().toISOString().slice(0, 13)}`,
        source: 'GovTrack',
        title: 'GovTrack feed: no active bills at this time',
        summary: 'US legislative activity feed returned no active bills. Signal floored.',
        url: 'https://www.govtrack.us',
        timestamp: new Date().toISOString(),
        category: 'governance' as const,
        severity: 'low' as const,
        metadata: { floor: true, signal_value: 0.15 },
      }];
    }

    return items.slice(0, 8).map((item) => {
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? item.match(/<title>(.*?)<\/title>/)?.[1]
        ?? 'Legislative activity';
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';
      const description = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
        ?? item.match(/<description>(.*?)<\/description>/)?.[1]
        ?? '';
      const ts = pubDate ? new Date(pubDate).toISOString() : new Date().toISOString();
      // Stable ID from URL path or title so the same bill isn't re-ingested across crons.
      const stableSlug = (link || title).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40) || ts.slice(0, 13);
      return {
        sourceId: `govtrack-${stableSlug}`,
        source: 'GovTrack',
        title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').slice(0, 200),
        summary: description.replace(/<[^>]+>/g, '').slice(0, 300) || `US legislative event: ${title}`,
        url: link,
        timestamp: ts,
        category: 'governance' as const,
        severity: 'medium' as const,
        metadata: { source: 'govtrack-rss' },
      };
    });
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
      geometry?: { type?: string; coordinates?: number[] | number[][] | number[][][] };
    }> = data?.features ?? [];

    return features.slice(0, 6).map((f) => {
      const mag = f.properties.mag ?? 0;
      const severity: RawEvent['severity'] =
        mag >= 6 ? 'high' : mag >= 4 ? 'medium' : 'low';

      const coords = f.geometry?.coordinates;
      let lat: number | undefined;
      let lng: number | undefined;
      if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        lng = coords[0];
        lat = coords[1];
      }

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
          lat,
          lng,
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
        sourceId: `coingecko-${coin}-${new Date().toISOString().slice(0, 13)}`,
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
  const [govtrack, usgs, coingecko, eveNews] = await Promise.allSettled([
    fetchGovTrack(),
    fetchUSGS(),
    fetchCoinGecko(),
    fetchEveGlobalNews().then((synthesis) => eveItemsToRawEvents(synthesis.items)),
  ]);

  const events: RawEvent[] = [
    ...(govtrack.status === 'fulfilled' ? govtrack.value : []),
    ...(usgs.status === 'fulfilled' ? usgs.value : []),
    ...(coingecko.status === 'fulfilled' ? coingecko.value : []),
    ...(eveNews.status === 'fulfilled' ? eveNews.value : []),
  ];

  // Sort by timestamp descending (most recent first)
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return events;
}
