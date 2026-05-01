// ============================================================================
// HERMES-µ — News/Information Velocity Micro Sub-Agent
//
// Polls Hacker News API, Wikipedia recent changes, and optional Perplexity Sonar.
// CC0 Public Domain
// ============================================================================

import {
  type AgentPollResult,
  type MicroSignal,
  type MicroAgentConfig,
  classifySeverity,
  normalizeDirect,
  normalizeInverse,
  safeFetch,
} from './core';
import { querySonarForLane } from '@/lib/signals/perplexity-sonar';

export const HERMES_CONFIG: MicroAgentConfig = {
  name: 'HERMES-µ',
  description: 'Information velocity — tech news flow, encyclopedic edit rate',
  pollIntervalMs: 5 * 60 * 1000,
  sources: ['Hacker News', 'Wikipedia Recent Changes', 'Perplexity Sonar', 'GDELT'],
};

// ── Hacker News: top story velocity ───────────────────────────────────────
type HNItem = {
  id: number;
  score: number;
  title: string;
  time: number;
  descendants?: number;
};

async function pollHackerNews(): Promise<MicroSignal | null> {
  const topUrl = 'https://hacker-news.firebaseio.com/v0/topstories.json';
  const topIds = await safeFetch<number[]>(topUrl);
  if (!topIds || topIds.length === 0) return null;

  // Sample top 5 stories for velocity
  const sampleIds = topIds.slice(0, 5);
  const stories = await Promise.all(
    sampleIds.map((id) =>
      safeFetch<HNItem>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`),
    ),
  );

  const valid = stories.filter((s): s is HNItem => s !== null);
  if (valid.length === 0) return null;

  const avgScore = valid.reduce((sum, s) => sum + s.score, 0) / valid.length;
  const avgComments = valid.reduce((sum, s) => sum + (s.descendants ?? 0), 0) / valid.length;

  // High engagement = information flowing = good signal
  // avgScore 100-500 is healthy, <50 is quiet, >1000 is anomalous
  const scoreSignal = avgScore < 50
    ? normalizeDirect(avgScore, 0, 50) * 0.6
    : avgScore <= 500
      ? 0.6 + normalizeDirect(avgScore, 50, 500) * 0.4
      : normalizeInverse(avgScore, 500, 2000) * 0.3 + 0.7; // very high = still good but capped

  const value = Number(Math.min(1, scoreSignal).toFixed(3));

  return {
    agentName: 'HERMES-µ',
    source: 'Hacker News',
    timestamp: new Date().toISOString(),
    value,
    label: `HN: top 5 avg score ${Math.round(avgScore)}, avg ${Math.round(avgComments)} comments`,
    severity: classifySeverity(value, { watch: 0.4, elevated: 0.2, critical: 0.05 }),
    raw: { avgScore: Math.round(avgScore), avgComments: Math.round(avgComments), topTitle: valid[0]?.title },
  };
}

// ── Wikipedia: recent changes rate ────────────────────────────────────────
type WikiChange = {
  type: string;
  title: string;
  timestamp: string;
  minor?: boolean;
};
type WikiResponse = {
  query?: { recentchanges?: WikiChange[] };
};

async function pollWikipedia(): Promise<MicroSignal | null> {
  // Last 50 edits on English Wikipedia
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rclimit=50&rctype=edit&rcprop=title|timestamp|flags&format=json&origin=*';

  const data = await safeFetch<WikiResponse>(url);
  const changes = data?.query?.recentchanges;
  if (!changes || changes.length === 0) return null;

  const now = Date.now();
  const timestamps = changes.map((c) => new Date(c.timestamp).getTime());
  const oldest = Math.min(...timestamps);
  const spanMinutes = (now - oldest) / (60 * 1000);

  // Edits per minute — Wikipedia normally sees 2-10 edits/min
  const editsPerMin = spanMinutes > 0 ? changes.length / spanMinutes : 0;
  const minorCount = changes.filter((c) => c.minor).length;

  // Healthy rate: 2-10 edits/min. Below 1 = quiet (possible issue), above 15 = burst
  const value = editsPerMin < 1
    ? Number(normalizeDirect(editsPerMin, 0, 1).toFixed(3)) * 0.5
    : editsPerMin <= 10
      ? Number((0.5 + normalizeDirect(editsPerMin, 1, 10) * 0.5).toFixed(3))
      : Number(Math.max(0.7, normalizeInverse(editsPerMin, 10, 30)).toFixed(3));

  return {
    agentName: 'HERMES-µ',
    source: 'Wikipedia Recent Changes',
    timestamp: new Date().toISOString(),
    value,
    label: `Wikipedia: ${editsPerMin.toFixed(1)} edits/min, ${minorCount}/${changes.length} minor`,
    severity: classifySeverity(value, { watch: 0.4, elevated: 0.2, critical: 0.05 }),
    raw: { editsPerMin: Number(editsPerMin.toFixed(2)), totalSampled: changes.length, minorCount },
  };
}


async function pollSonar(): Promise<MicroSignal | null> {
  const result = await querySonarForLane(
    'HERMES',
    'Major technology, governance, and civic events globally in the last 24 hours. List top 5 developments.',
    'day',
  );

  if (!result) return null;

  return {
    agentName: 'HERMES-µ',
    source: 'Perplexity Sonar',
    timestamp: result.timestamp,
    value: 0.8,
    label: `Sonar: ${result.sources.length} cited sources · ${result.answer.slice(0, 80)}...`,
    severity: 'nominal',
    raw: {
      answer: result.answer,
      sourceCount: result.sources.length,
      topSource: result.sources[0]?.title ?? null,
    },
  };
}

type GDELTResponse = {
  articles?: Array<{
    title?: string;
    sourcecountry?: string;
    sourceCountry?: string;
    domain?: string;
    tone?: number | string;
  }>;
};

async function pollGDELT(): Promise<MicroSignal | null> {
  const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=governance+civic+institutions&mode=artlist&maxrecords=10&format=json&timespan=1d';
  const data = await safeFetch<GDELTResponse>(url, 10000);
  const articles = data?.articles;
  if (!articles || articles.length === 0) return null;

  const tones = articles
    .map((article) => {
      const tone = article.tone;
      if (typeof tone === 'number' && Number.isFinite(tone)) return tone;
      if (typeof tone === 'string') {
        const parsed = Number.parseFloat(tone);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })
    .filter((tone): tone is number => tone !== null);

  const avgTone = tones.length > 0
    ? tones.reduce((sum, tone) => sum + tone, 0) / tones.length
    : 0;

  const normalized = Math.max(0, Math.min(1, (avgTone + 100) / 200));

  return {
    agentName: 'HERMES-µ',
    source: 'GDELT',
    timestamp: new Date().toISOString(),
    value: Number(normalized.toFixed(3)),
    label: `GDELT: ${articles.length} articles, avg tone ${avgTone.toFixed(1)}`,
    severity: classifySeverity(normalized, { watch: 0.45, elevated: 0.3, critical: 0.15 }),
    raw: {
      count: articles.length,
      avgTone: Number(avgTone.toFixed(2)),
      topDomain: articles[0]?.domain ?? null,
      topCountry: articles[0]?.sourcecountry ?? articles[0]?.sourceCountry ?? null,
    },
  };
}

// ── Federal Register: civic/governance document velocity ──────────────────────
type FederalRegisterResponse = {
  count?: number;
  results?: Array<{ type?: string; title?: string }>;
};

async function pollFederalRegister(): Promise<MicroSignal | null> {
  // Free public API — no key required. Returns today's published documents count.
  const today = new Date().toISOString().split('T')[0];
  const url = `https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&conditions[publication_date][gte]=${today}`;
  const data = await safeFetch<FederalRegisterResponse>(url, 6000);
  if (!data) return null;

  const count = data.count ?? (data.results?.length ?? 0);
  // 0 documents = weekend/holiday (score 0.5 neutral), 100+ = high civic activity
  const value = count === 0
    ? 0.5
    : Number(Math.min(0.5 + (count / 200) * 0.5, 1.0).toFixed(3));

  return {
    agentName: 'HERMES-µ',
    source: 'Federal Register',
    timestamp: new Date().toISOString(),
    value,
    label: `Federal Register: ${count} documents published today`,
    severity: classifySeverity(value, { watch: 0.35, elevated: 0.2, critical: 0.1 }),
    raw: { count, topTitle: data.results?.[0]?.title ?? null },
  };
}

// ── Poll all HERMES-µ sources ─────────────────────────────────────────────
export async function pollHermes(): Promise<AgentPollResult> {
  const errors: string[] = [];
  const signals: MicroSignal[] = [];

  const hn = await pollHackerNews();
  if (hn) signals.push(hn);
  else errors.push('Hacker News API fetch failed');

  const wiki = await pollWikipedia();
  if (wiki) signals.push(wiki);
  else errors.push('Wikipedia API fetch failed');

  const sonar = await pollSonar();
  if (sonar) signals.push(sonar);
  else errors.push('Perplexity Sonar unavailable or not configured');

  const gdelt = await pollGDELT();
  if (gdelt) {
    signals.push(gdelt);
  } else {
    // GDELT persistently unreachable — push neutral so composite is not penalized.
    signals.push({
      agentName: 'HERMES-µ',
      source: 'GDELT',
      timestamp: new Date().toISOString(),
      value: 0.5,
      label: 'GDELT unavailable — neutral baseline',
      severity: 'nominal',
      raw: { fallback: true },
    });
    errors.push('GDELT API fetch failed (neutral fallback applied)');
  }

  // Federal Register: free civic/governance narrative signal (no auth required).
  // Boosts narrative domain when US civic documents are publishing at healthy rate.
  const fedReg = await pollFederalRegister();
  if (fedReg) {
    signals.push(fedReg);
  } else {
    errors.push('Federal Register API fetch failed');
  }

  return {
    agentName: 'HERMES-µ',
    signals,
    polledAt: new Date().toISOString(),
    errors,
    healthy: signals.length > 0,
  };
}
