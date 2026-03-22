// ============================================================================
// HERMES-µ — News/Information Velocity Micro Sub-Agent
//
// Polls Hacker News API and Wikipedia recent changes.
// Both free, no API key required.
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

export const HERMES_CONFIG: MicroAgentConfig = {
  name: 'HERMES-µ',
  description: 'Information velocity — tech news flow, encyclopedic edit rate',
  pollIntervalMs: 5 * 60 * 1000,
  sources: ['Hacker News', 'Wikipedia Recent Changes'],
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

  return {
    agentName: 'HERMES-µ',
    signals,
    polledAt: new Date().toISOString(),
    errors,
    healthy: signals.length > 0,
  };
}
