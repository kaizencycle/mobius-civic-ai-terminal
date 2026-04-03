/**
 * EVE — Global News Synthesis Source
 *
 * EVE is the Constitutional Eye. She observes broad public signals,
 * synthesizes them into structured items, and emits pattern-aware notes
 * for the existing EPICON ingest pipeline.
 *
 * Sources:
 * 1. Wikipedia Current Events via MediaWiki API (free, no auth)
 *
 * CC0 Public Domain
 */

import type { RawEvent } from '@/lib/echo/sources';

export type NewsCategory =
  | 'geopolitical'
  | 'governance'
  | 'market'
  | 'infrastructure'
  | 'ethics'
  | 'civic-risk';

export type Severity = 'low' | 'medium' | 'high';

export type EveNewsItem = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  region: string;
  timestamp: string;
  category: NewsCategory;
  severity: Severity;
  eve_tag: string;
};

export type EveSynthesis = {
  timestamp: string;
  agent: 'EVE';
  total_items: number;
  items: EveNewsItem[];
  pattern_notes: string[];
  dominant_region: string;
  dominant_category: NewsCategory;
  global_tension: 'low' | 'moderate' | 'elevated' | 'high';
};

type GDELTArticle = {
  title?: string;
  seendate?: string;
  url?: string;
  domain?: string;
};

const FETCH_TIMEOUT_MS = 10_000;

const GEO_KEYWORDS = [
  'war',
  'conflict',
  'military',
  'sanctions',
  'diplomacy',
  'summit',
  'protest',
  'ceasefire',
  'attack',
  'missile',
  'nuclear',
  'invasion',
  'border',
  'refugee',
  'humanitarian',
  'troops',
  'strike',
];

const GOV_KEYWORDS = [
  'election',
  'vote',
  'law',
  'legislation',
  'congress',
  'parliament',
  'court',
  'ruling',
  'policy',
  'regulation',
  'budget',
  'tariff',
  'senate',
  'governor',
  'minister',
  'resign',
  'impeach',
  'bill',
];

const MARKET_KEYWORDS = [
  'stock',
  'market',
  'trade',
  'tariff',
  'economy',
  'gdp',
  'inflation',
  'fed',
  'rate',
  'crypto',
  'bitcoin',
  'oil',
  'commodity',
  'bank',
  'yield',
  'jobs',
];

const INFRA_KEYWORDS = [
  'earthquake',
  'hurricane',
  'flood',
  'wildfire',
  'tornado',
  'pandemic',
  'outbreak',
  'climate',
  'volcano',
  'cyber',
  'grid',
  'infrastructure',
  'pipeline',
  'blackout',
  'dam',
  'outage',
];

const REGION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(china|beijing|xi jinping|chinese)\b/i, 'China'],
  [/\b(russia|moscow|putin|kremlin|ukrainian?|ukraine)\b/i, 'Russia/Ukraine'],
  [/\b(iran|tehran|hormuz|persian)\b/i, 'Middle East'],
  [/\b(israel|gaza|hamas|netanyahu|palestinian)\b/i, 'Middle East'],
  [/\b(eu|european|brussels|nato)\b/i, 'Europe'],
  [/\b(india|modi|delhi)\b/i, 'South Asia'],
  [/\b(japan|tokyo|korean?|seoul|pyongyang)\b/i, 'East Asia'],
  [/\b(africa|nigeria|kenya|south africa)\b/i, 'Africa'],
  [/\b(brazil|argentina|latin america)\b/i, 'Latin America'],
  [/\b(united states|u\.s\.|washington|congress|trump|biden)\b/i, 'US'],
  [/\b(uk|britain|london)\b/i, 'UK'],
];

function nowIso(): string {
  return new Date().toISOString();
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      },
      next: { revalidate: 180 },
    });

    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function toIsoOrNow(input?: string): string {
  if (!input) return nowIso();
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? nowIso() : parsed.toISOString();
}

function gdeltSeenDateToIso(seendate?: string): string {
  if (!seendate) return nowIso();

  const normalized = seendate.replace(
    /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
    '$1-$2-$3T$4:$5:$6Z'
  );

  return toIsoOrNow(normalized);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDedupKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function categorizeHeadline(text: string): NewsCategory {
  const lower = text.toLowerCase();

  const scores: Record<NewsCategory, number> = {
    geopolitical: GEO_KEYWORDS.filter((keyword) => lower.includes(keyword)).length,
    governance: GOV_KEYWORDS.filter((keyword) => lower.includes(keyword)).length,
    market: MARKET_KEYWORDS.filter((keyword) => lower.includes(keyword)).length,
    infrastructure: INFRA_KEYWORDS.filter((keyword) => lower.includes(keyword)).length,
    ethics: 0,
    'civic-risk': 0,
  };

  const max = Math.max(...Object.values(scores));
  if (max === 0) return 'geopolitical';

  const ordered = Object.entries(scores) as Array<[NewsCategory, number]>;
  return ordered.sort((a, b) => b[1] - a[1])[0][0];
}

function inferSeverity(title: string, category: NewsCategory): Severity {
  const lower = title.toLowerCase();

  if (
    /attack|missile|strike|war|invasion|explosion|earthquake|hurricane|pandemic|blackout|cyberattack|cyber attack/.test(
      lower
    )
  ) {
    return 'high';
  }

  if (
    /ceasefire|summit|election|protest|tariff|inflation|flood|wildfire|outbreak|sanction|court|ruling|rate|volcano/.test(
      lower
    )
  ) {
    return 'medium';
  }

  return category === 'market' ? 'low' : 'medium';
}

function inferRegion(title: string, sourceHint = ''): string {
  const text = `${title} ${sourceHint}`;
  for (const [pattern, region] of REGION_PATTERNS) {
    if (pattern.test(text)) return region;
  }
  return 'Global';
}

function generateEveTag(title: string, category: NewsCategory): string {
  const lower = title.toLowerCase();

  if (category === 'geopolitical') {
    if (lower.includes('ceasefire') || lower.includes('peace')) {
      return 'De-escalation signal detected';
    }
    if (
      lower.includes('attack') ||
      lower.includes('strike') ||
      lower.includes('missile') ||
      lower.includes('war')
    ) {
      return 'Escalation pattern - monitor for cascade';
    }
    if (lower.includes('sanction')) {
      return 'Economic pressure vector';
    }
    return 'Geopolitical movement - cross-reference with market signals';
  }

  if (category === 'governance') {
    if (lower.includes('election') || lower.includes('vote')) {
      return 'Democratic process in motion';
    }
    if (lower.includes('resign') || lower.includes('impeach')) {
      return 'Leadership transition signal';
    }
    return 'Governance activity - assess constitutional impact';
  }

  if (category === 'market') {
    return 'Economic signal - correlate with geopolitical drivers';
  }

  if (category === 'ethics') {
    return 'Ethics lane active - monitor governance and integrity posture';
  }

  if (category === 'civic-risk') {
    return 'Civic-risk lane active - assess transmission to public trust';
  }

  if (category === 'infrastructure') {
    if (
      lower.includes('earthquake') ||
      lower.includes('hurricane') ||
      lower.includes('flood') ||
      lower.includes('wildfire')
    ) {
      return 'Natural system disruption - assess humanitarian impact';
    }
    if (
      lower.includes('cyber') ||
      lower.includes('outage') ||
      lower.includes('blackout')
    ) {
      return 'Infrastructure vulnerability - assess systemic risk';
    }
    return 'Infrastructure event - monitor for cascade effects';
  }

  return 'Cross-domain signal - EVE observing';
}

function extractWikipediaSectionHtml(
  html: string,
  monthName: string,
  day: number
): string {
  const monthEscaped = escapeRegExp(monthName);
  const headingPattern = new RegExp(
    `<h[23][^>]*>[\\s\\S]*?${monthEscaped}\\s+${day}[\\s\\S]*?<\\/h[23]>([\\s\\S]*?)(?=<h[23][^>]*>|$)`,
    'i'
  );
  const headingMatch = html.match(headingPattern);
  if (headingMatch?.[1]) return headingMatch[1];

  const loosePattern = new RegExp(
    `${monthEscaped}\\s+${day}[\\s\\S]*?<ul>([\\s\\S]*?)<\\/ul>`,
    'i'
  );
  const looseMatch = html.match(loosePattern);
  if (looseMatch?.[1]) return looseMatch[1];

  return html;
}

async function fetchWikipediaCurrentEvents(): Promise<EveNewsItem[]> {
  const today = new Date();
  const year = today.getUTCFullYear();
  const monthName = today.toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  const day = today.getUTCDate();

  const pageTitle = `Portal:Current_events/${monthName}_${year}`;
  const url =
    `https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*` +
    `&page=${encodeURIComponent(pageTitle)}&prop=text`;

  const data = await fetchJson<{ parse?: { text?: Record<string, string> } }>(
    url
  );

  const html = data?.parse?.text?.['*'] ?? '';
  if (!html) return [];

  const sectionHtml = extractWikipediaSectionHtml(html, monthName, day);

  const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const items: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = liPattern.exec(sectionHtml)) !== null && items.length < 6) {
    const text = stripHtml(match[1]);
    if (text.length >= 30) items.push(text);
  }

  return items.map((text, index) => {
    const category = categorizeHeadline(text);
    const region = inferRegion(text, 'Wikipedia');
    const severity = inferSeverity(text, category);
    const title = text.length > 120 ? `${text.slice(0, 117)}...` : text;

    return {
      id: `eve-wiki-${year}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}-${index}`,
      title,
      summary: text,
      url: 'https://en.wikipedia.org/wiki/Portal:Current_events',
      source: 'Wikipedia Current Events',
      region,
      timestamp: nowIso(),
      category,
      severity,
      eve_tag: generateEveTag(text, category),
    };
  });
}

async function fetchGDELTGlobal(): Promise<EveNewsItem[]> {
  const query = [
    'summit',
    'treaty',
    'protest',
    'election',
    'climate',
    'pandemic',
    'ceasefire',
    'trade',
  ].join(' OR ');

  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}` +
    '&mode=ArtList&maxrecords=8&format=json&sort=DateDesc';

  const data = await fetchJson<{ articles?: GDELTArticle[] }>(url);
  const articles = data?.articles ?? [];

  return articles.slice(0, 6).map((article, index) => {
    const title = article.title?.trim() || 'Global event detected';
    const category = categorizeHeadline(title);
    const region = inferRegion(title, article.domain ?? '');
    const severity = inferSeverity(title, category);

    return {
      id: `eve-gdelt-${index}-${normalizeDedupKey(title)}`,
      title,
      summary: article.domain
        ? `Global pattern via ${article.domain}. Cross-domain signal tracked by EVE.`
        : 'Global pattern tracked by EVE.',
      url: article.url || '',
      source: article.domain ? `GDELT / ${article.domain}` : 'GDELT',
      region,
      timestamp: gdeltSeenDateToIso(article.seendate),
      category,
      severity,
      eve_tag: generateEveTag(title, category),
    };
  });
}

function computeGlobalTension(
  items: EveNewsItem[]
): EveSynthesis['global_tension'] {
  const highCount = items.filter((item) => item.severity === 'high').length;
  const geoCount = items.filter((item) => item.category === 'geopolitical').length;
  const infraCount = items.filter((item) => item.category === 'infrastructure').length;

  if (highCount >= 3 || (highCount >= 1 && geoCount >= 5)) return 'high';
  if (highCount >= 1 || geoCount >= 4 || infraCount >= 3) return 'elevated';
  if (geoCount >= 2 || infraCount >= 2) return 'moderate';
  return 'low';
}

function generatePatternNotes(items: EveNewsItem[]): string[] {
  if (items.length === 0) {
    return ['No live items available - EVE feed degraded gracefully'];
  }

  const notes: string[] = [];
  const regions = new Map<string, number>();
  const categories = new Map<NewsCategory, number>();

  for (const item of items) {
    regions.set(item.region, (regions.get(item.region) ?? 0) + 1);
    categories.set(item.category, (categories.get(item.category) ?? 0) + 1);
  }

  const topRegion = [...regions.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topRegion && topRegion[1] >= 3) {
    notes.push(
      `${topRegion[0]} dominates the news cycle with ${topRegion[1]} of ${items.length} items`
    );
  }

  const topCategory = [...categories.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCategory && topCategory[1] > items.length * 0.5) {
    notes.push(
      `${topCategory[0]} events are ${Math.round((topCategory[1] / items.length) * 100)}% of the current feed`
    );
  }

  const hasGeo = (categories.get('geopolitical') ?? 0) > 0;
  const hasMarket = (categories.get('market') ?? 0) > 0;
  const hasInfra = (categories.get('infrastructure') ?? 0) > 0;

  if (hasGeo && hasMarket) {
    notes.push(
      'Geopolitical and market signals are co-present - watch for transmission'
    );
  }

  if (hasGeo && hasInfra) {
    notes.push(
      'Political and infrastructure stressors are co-present - assess cascade pathways'
    );
  }

  const hasDeEscalation = items.some((item) => /ceasefire|peace/i.test(item.title));
  if (hasDeEscalation) {
    notes.push('De-escalation signals present, but require persistence to matter');
  }

  if (notes.length === 0) {
    notes.push(
      'News flow is distributed across regions and categories - no dominant pattern'
    );
  }

  return notes;
}

export async function fetchEveGlobalNews(): Promise<EveSynthesis> {
  const [wiki] = await Promise.allSettled([fetchWikipediaCurrentEvents()]);

  const items: EveNewsItem[] = [
    ...(wiki.status === 'fulfilled' ? wiki.value : []),
  ];

  const seen = new Set<string>();
  const deduped = items.filter((item) => {
    const key = normalizeDedupKey(item.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const finalItems = deduped.slice(0, 15);

  const regionCounts = new Map<string, number>();
  const categoryCounts = new Map<NewsCategory, number>();

  for (const item of finalItems) {
    regionCounts.set(item.region, (regionCounts.get(item.region) ?? 0) + 1);
    categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
  }

  const dominantRegion =
    [...regionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Global';

  const dominantCategory =
    [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    'geopolitical';

  return {
    timestamp: nowIso(),
    agent: 'EVE',
    total_items: finalItems.length,
    items: finalItems,
    pattern_notes: generatePatternNotes(finalItems),
    dominant_region: dominantRegion,
    dominant_category: dominantCategory,
    global_tension: computeGlobalTension(finalItems),
  };
}

export function eveItemsToRawEvents(items: EveNewsItem[]): RawEvent[] {
  return items.map((item) => ({
    sourceId: item.id,
    source: `EVE / ${item.source}`,
    title: item.title,
    summary: `${item.eve_tag}. ${item.summary}`,
    url: item.url,
    timestamp: item.timestamp,
    category:
      item.category === 'ethics' || item.category === 'civic-risk'
        ? 'governance'
        : item.category,
    severity: item.severity,
    metadata: {
      region: item.region,
      eve_tag: item.eve_tag,
      original_source: item.source,
      eve_category: item.category,
    },
  }));
}
