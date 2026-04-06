import { kvGet, kvSet } from '@/lib/kv/store';

export type FinvizSignalType =
  | 'top_gainers'
  | 'top_losers'
  | 'most_active'
  | 'unusual_volume'
  | 'new_highs'
  | 'new_lows';

export type FinvizLane = 'fast' | 'medium' | 'slow';

export type FinvizScreenerRow = {
  ticker: string;
  company?: string;
  sector?: string;
  price: number;
  changePct: number;
  volume: number;
  marketCap?: string;
  signal: FinvizSignalType;
  sourceUrl: string;
  publishedAt: string;
};

export type FinvizNewsRow = {
  ticker?: string;
  headline: string;
  source: string;
  url?: string;
  publishedAt: string;
  lane: FinvizLane;
};

export type FinvizEventEnvelope<TPayload> = {
  event_id: string;
  source: 'finviz';
  category: 'market';
  subtype: 'screener_match' | 'news_item';
  cycle: string;
  received_at: string;
  dedup_key: string;
  confidence_seed: number;
  route_metadata: {
    route_agent: 'HERMES';
    lane: FinvizLane;
    signal_type?: FinvizSignalType;
  };
  payload: TPayload;
};

type CachePayload<T> = {
  fetchedAt: string;
  items: T[];
  events: FinvizEventEnvelope<Record<string, unknown>>[];
  diagnostics: {
    cachedCount: number;
    dedupSuppressedCount: number;
    lastFetchAt: string;
    lane: FinvizLane;
  };
};

type DedupStore = Record<string, number>;

type LastFetchStore = Partial<Record<'screener' | 'news' | 'signals', string>>;

const FINVIZ_BASE = 'https://finviz.com';
const USER_AGENT =
  'Mozilla/5.0 (compatible; MobiusTerminal/1.0; +https://mobius.local)';

const KEY_RAW = 'ingest:finviz:raw';
const KEY_SCREENER = 'market:finviz:screener';
const KEY_NEWS = 'market:finviz:news';
const KEY_SIGNALS = 'market:finviz:signals';
const KEY_DEDUP = 'market:finviz:dedup';
const KEY_LAST_FETCH = 'market:finviz:last-fetch';

const DEDUP_TTL_SECONDS = 60 * 60 * 24;
const SCREENER_TTL_SECONDS = 60 * 3;
const NEWS_TTL_SECONDS = 60 * 5;
const SIGNALS_TTL_SECONDS = 60 * 2;
const RAW_TTL_SECONDS = 60 * 10;

const SIGNAL_CONFIG: Array<{ code: string; signal: FinvizSignalType; lane: FinvizLane }> = [
  { code: 'ta_topgainers', signal: 'top_gainers', lane: 'fast' },
  { code: 'ta_toplosers', signal: 'top_losers', lane: 'fast' },
  { code: 'ta_mostactive', signal: 'most_active', lane: 'fast' },
  { code: 'ta_unusualvolume', signal: 'unusual_volume', lane: 'fast' },
  { code: 'ta_newhigh', signal: 'new_highs', lane: 'medium' },
  { code: 'ta_newlow', signal: 'new_lows', lane: 'medium' },
];

function htmlDecode(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/');
}

function stripTags(input: string): string {
  return htmlDecode(input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[$,%]/g, '').replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseVolume(raw: string): number {
  const value = raw.trim().toUpperCase();
  const suffix = value.endsWith('K') ? 1_000 : value.endsWith('M') ? 1_000_000 : value.endsWith('B') ? 1_000_000_000 : 1;
  const n = Number(value.replace(/[KMB]/g, '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * suffix) : 0;
}

function formatCycle(now: Date): string {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - start;
  const day = Math.floor(diff / 86_400_000);
  return `C-${day}`;
}

function toMinuteBucket(dateIso: string): string {
  return dateIso.slice(0, 16);
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`finviz_http_${res.status}`);
    }

    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadDedupStore(): Promise<DedupStore> {
  return (await kvGet<DedupStore>(KEY_DEDUP)) ?? {};
}

async function persistDedupStore(store: DedupStore): Promise<void> {
  const now = Date.now();
  const trimmed = Object.fromEntries(
    Object.entries(store).filter(([, seenAt]) => now - seenAt < DEDUP_TTL_SECONDS * 1000),
  );
  await kvSet(KEY_DEDUP, trimmed, DEDUP_TTL_SECONDS);
}

async function markLastFetch(type: keyof LastFetchStore, timestamp: string) {
  const existing = (await kvGet<LastFetchStore>(KEY_LAST_FETCH)) ?? {};
  existing[type] = timestamp;
  await kvSet(KEY_LAST_FETCH, existing, 60 * 60 * 24);
}

function signalFromUrl(url: string): FinvizSignalType {
  const found = SIGNAL_CONFIG.find((entry) => url.includes(entry.code));
  return found?.signal ?? 'most_active';
}

function laneFromSignal(signal: FinvizSignalType): FinvizLane {
  return SIGNAL_CONFIG.find((entry) => entry.signal === signal)?.lane ?? 'fast';
}

function createScreenerEvent(row: FinvizScreenerRow): FinvizEventEnvelope<Record<string, unknown>> {
  const receivedAt = new Date().toISOString();
  const dedupKey = `finviz:screener:${row.signal}:${row.ticker.toLowerCase()}:${toMinuteBucket(receivedAt)}`;
  return {
    event_id: `finviz-screener-${row.ticker}-${toMinuteBucket(receivedAt)}`,
    source: 'finviz',
    category: 'market',
    subtype: 'screener_match',
    cycle: formatCycle(new Date(receivedAt)),
    received_at: receivedAt,
    dedup_key: dedupKey,
    confidence_seed: 0.72,
    route_metadata: {
      route_agent: 'HERMES',
      lane: laneFromSignal(row.signal),
      signal_type: row.signal,
    },
    payload: {
      ticker: row.ticker,
      company: row.company,
      sector: row.sector,
      price: row.price,
      change_pct: row.changePct,
      volume: row.volume,
      market_cap: row.marketCap,
      signal: row.signal,
      source_url: row.sourceUrl,
      published_at: row.publishedAt,
    },
  };
}

function headlineHash(headline: string): string {
  let hash = 0;
  for (let i = 0; i < headline.length; i += 1) {
    hash = (hash * 31 + headline.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function createNewsEvent(item: FinvizNewsRow): FinvizEventEnvelope<Record<string, unknown>> {
  const receivedAt = new Date().toISOString();
  const headlineKey = headlineHash(item.headline.toLowerCase());
  const dedupKey = item.url
    ? `finviz:news:url:${item.url}`
    : `finviz:news:${item.ticker ?? 'market'}:${headlineKey}`;

  return {
    event_id: `finviz-news-${item.ticker ?? 'market'}-${headlineKey}`,
    source: 'finviz',
    category: 'market',
    subtype: 'news_item',
    cycle: formatCycle(new Date(receivedAt)),
    received_at: receivedAt,
    dedup_key: dedupKey,
    confidence_seed: 0.64,
    route_metadata: {
      route_agent: 'HERMES',
      lane: item.lane,
    },
    payload: {
      ticker: item.ticker,
      headline: item.headline,
      source: item.source,
      url: item.url,
      published_at: item.publishedAt,
    },
  };
}

function parseScreenerRows(html: string, sourceUrl: string): FinvizScreenerRow[] {
  const rowMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gim) ?? [];
  const parsed: FinvizScreenerRow[] = [];
  const signal = signalFromUrl(sourceUrl);
  const publishedAt = new Date().toISOString();

  for (const rowHtml of rowMatches) {
    if (!/screener-link-primary/i.test(rowHtml)) continue;

    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gim)).map((m) =>
      stripTags(m[1] ?? ''),
    );
    const tickerMatch = rowHtml.match(/screener-link-primary[^>]*>([^<]+)</i);
    const ticker = tickerMatch ? stripTags(tickerMatch[1]) : cells[1] ?? '';
    if (!ticker || !/^[A-Z.\-]{1,10}$/.test(ticker)) continue;

    const company = cells[2] || undefined;
    const sector = cells[3] || undefined;
    const marketCap = cells[6] || undefined;
    const price = parseNumber(cells[8] ?? '0');
    const changePct = parseNumber(cells[9] ?? '0');
    const volume = parseVolume(cells[10] ?? '0');

    parsed.push({
      ticker,
      company,
      sector,
      marketCap,
      price,
      changePct,
      volume,
      signal,
      sourceUrl,
      publishedAt,
    });
  }

  return parsed;
}

function parseNewsRows(html: string): FinvizNewsRow[] {
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gim) ?? [];
  const parsed: FinvizNewsRow[] = [];

  for (const row of rows) {
    if (!/news_link/i.test(row)) continue;

    const anchor = row.match(/<a[^>]*class="news_link"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/i);
    if (!anchor) continue;

    const href = anchor[1];
    const headline = stripTags(anchor[2]);
    if (!headline) continue;

    const sourceMatch = row.match(/<span[^>]*class="news_source"[^>]*>(.*?)<\/span>/i);
    const source = sourceMatch ? stripTags(sourceMatch[1]) : 'finviz';

    const tickerMatch = row.match(/quote\.ashx\?t=([A-Za-z.\-]+)/i);
    const ticker = tickerMatch?.[1]?.toUpperCase();

    const dateMatch = row.match(/<td[^>]*align="right"[^>]*>(.*?)<\/td>/i);
    const rawTime = dateMatch ? stripTags(dateMatch[1]) : '';

    parsed.push({
      ticker,
      headline,
      source,
      url: href.startsWith('http') ? href : `${FINVIZ_BASE}${href}`,
      publishedAt: rawTime || new Date().toISOString(),
      lane: 'fast',
    });
  }

  return parsed;
}

async function runDedup(
  events: FinvizEventEnvelope<Record<string, unknown>>[],
): Promise<{ kept: FinvizEventEnvelope<Record<string, unknown>>[]; suppressed: number }> {
  const dedupStore = await loadDedupStore();
  const now = Date.now();
  let suppressed = 0;
  const kept: FinvizEventEnvelope<Record<string, unknown>>[] = [];

  for (const event of events) {
    if (dedupStore[event.dedup_key]) {
      suppressed += 1;
      continue;
    }

    dedupStore[event.dedup_key] = now;
    kept.push(event);
  }

  await persistDedupStore(dedupStore);

  return { kept, suppressed };
}

function asCachePayload<T>(
  items: T[],
  events: FinvizEventEnvelope<Record<string, unknown>>[],
  lane: FinvizLane,
  dedupSuppressedCount: number,
): CachePayload<T> {
  const fetchedAt = new Date().toISOString();
  return {
    fetchedAt,
    items,
    events,
    diagnostics: {
      cachedCount: items.length,
      dedupSuppressedCount,
      lastFetchAt: fetchedAt,
      lane,
    },
  };
}

async function readCached<T>(key: string): Promise<CachePayload<T> | null> {
  return kvGet<CachePayload<T>>(key);
}

function groupedScreener(rows: FinvizScreenerRow[]) {
  return rows.reduce<Record<FinvizSignalType, FinvizScreenerRow[]>>(
    (acc, row) => {
      acc[row.signal] ??= [];
      acc[row.signal].push(row);
      return acc;
    },
    {
      top_gainers: [],
      top_losers: [],
      most_active: [],
      unusual_volume: [],
      new_highs: [],
      new_lows: [],
    },
  );
}

export async function fetchFinvizScreener() {
  const batches = await Promise.all(
    SIGNAL_CONFIG.map(async (signal) => {
      const url = `${FINVIZ_BASE}/screener.ashx?v=111&s=${signal.code}`;
      const html = await fetchText(url);
      await kvSet(KEY_RAW, { type: 'screener', signal: signal.signal, html, fetchedAt: new Date().toISOString() }, RAW_TTL_SECONDS);
      return parseScreenerRows(html, url);
    }),
  );

  const rows = batches.flat();
  const eventPairs = rows.map((row) => ({ row, event: createScreenerEvent(row) }));
  const allEvents = eventPairs.map((entry) => entry.event);
  const dedup = await runDedup(allEvents);
  const dedupKeys = new Set(dedup.kept.map((event) => event.dedup_key));
  const keptRows = eventPairs
    .filter((entry) => dedupKeys.has(entry.event.dedup_key))
    .map((entry) => entry.row);

  const payload = asCachePayload(keptRows, dedup.kept, 'fast', dedup.suppressed);
  await kvSet(KEY_SCREENER, payload, SCREENER_TTL_SECONDS);
  await markLastFetch('screener', payload.fetchedAt);

  return payload;
}

export async function fetchFinvizNews() {
  const url = `${FINVIZ_BASE}/news.ashx`;
  const html = await fetchText(url);
  await kvSet(KEY_RAW, { type: 'news', html, fetchedAt: new Date().toISOString() }, RAW_TTL_SECONDS);

  const rows = parseNewsRows(html).slice(0, 80);
  const eventPairs = rows.map((row) => ({ row, event: createNewsEvent(row) }));
  const allEvents = eventPairs.map((entry) => entry.event);
  const dedup = await runDedup(allEvents);
  const dedupKeys = new Set(dedup.kept.map((event) => event.dedup_key));
  const keptRows = eventPairs
    .filter((entry) => dedupKeys.has(entry.event.dedup_key))
    .map((entry) => entry.row);

  const payload = asCachePayload(keptRows, dedup.kept, 'fast', dedup.suppressed);
  await kvSet(KEY_NEWS, payload, NEWS_TTL_SECONDS);
  await markLastFetch('news', payload.fetchedAt);

  return payload;
}

export async function getFinvizScreener() {
  try {
    const payload = await fetchFinvizScreener();

    return {
      ok: true,
      degraded: false,
      source: 'finviz',
      fetchedAt: payload.fetchedAt,
      grouped: groupedScreener(payload.items),
      items: payload.items,
      events: payload.events,
      diagnostics: payload.diagnostics,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'finviz_upstream_unavailable';
    const cached = await readCached<FinvizScreenerRow>(KEY_SCREENER);

    return {
      ok: false,
      degraded: true,
      reason,
      source: 'fallback',
      fetchedAt: cached?.fetchedAt ?? null,
      grouped: groupedScreener(cached?.items ?? []),
      items: cached?.items ?? [],
      events: cached?.events ?? [],
      diagnostics: {
        cachedCount: cached?.items.length ?? 0,
        dedupSuppressedCount: cached?.diagnostics.dedupSuppressedCount ?? 0,
        lastFetchAt: cached?.fetchedAt ?? null,
      },
    };
  }
}

export async function getFinvizNews() {
  try {
    const payload = await fetchFinvizNews();

    return {
      ok: true,
      degraded: false,
      source: 'finviz',
      fetchedAt: payload.fetchedAt,
      items: payload.items,
      events: payload.events,
      diagnostics: payload.diagnostics,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'finviz_upstream_unavailable';
    const cached = await readCached<FinvizNewsRow>(KEY_NEWS);

    return {
      ok: false,
      degraded: true,
      reason,
      source: 'fallback',
      fetchedAt: cached?.fetchedAt ?? null,
      items: cached?.items ?? [],
      events: cached?.events ?? [],
      diagnostics: {
        cachedCount: cached?.items.length ?? 0,
        dedupSuppressedCount: cached?.diagnostics.dedupSuppressedCount ?? 0,
        lastFetchAt: cached?.fetchedAt ?? null,
      },
    };
  }
}

export async function getFinvizSignals() {
  try {
    const [screener, news] = await Promise.all([getFinvizScreener(), getFinvizNews()]);

    const momentum = screener.items.filter((row) => row.signal === 'top_gainers' || row.signal === 'top_losers');
    const volume = screener.items.filter((row) => row.signal === 'most_active' || row.signal === 'unusual_volume');
    const breadth = screener.items.filter((row) => row.signal === 'new_highs' || row.signal === 'new_lows');

    const payload = {
      fetchedAt: new Date().toISOString(),
      items: {
        momentum,
        volatility: screener.items.filter((row) => Math.abs(row.changePct) >= 5),
        volume,
        breadth,
        news: news.items,
      },
      diagnostics: {
        screenerDegraded: screener.degraded,
        newsDegraded: news.degraded,
        screenerItems: screener.items.length,
        newsItems: news.items.length,
      },
    };

    await kvSet(KEY_SIGNALS, payload, SIGNALS_TTL_SECONDS);
    await markLastFetch('signals', payload.fetchedAt);

    const degraded = screener.degraded || news.degraded;

    return {
      ok: !degraded,
      degraded,
      reason: degraded ? 'finviz_partial_degraded' : null,
      source: degraded ? 'fallback' : 'finviz',
      ...payload,
    };
  } catch (error) {
    const cached = await kvGet<Record<string, unknown>>(KEY_SIGNALS);
    return {
      ok: false,
      degraded: true,
      reason: error instanceof Error ? error.message : 'finviz_upstream_unavailable',
      source: 'fallback',
      ...(cached ?? {
        fetchedAt: null,
        items: { momentum: [], volatility: [], volume: [], breadth: [], news: [] },
        diagnostics: {
          screenerDegraded: true,
          newsDegraded: true,
          screenerItems: 0,
          newsItems: 0,
        },
      }),
    };
  }
}
