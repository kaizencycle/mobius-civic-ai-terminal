import { currentCycleId } from '@/lib/eve/cycle-engine';

export type SonarRecency = 'hour' | 'day' | 'week' | 'month';

export interface SonarSource {
  title: string;
  url: string;
}

export interface SonarSignal {
  query: string;
  answer: string;
  sources: SonarSource[];
  recency: SonarRecency;
  timestamp: string;
}

type SonarLane = 'HERMES' | 'EVE';

const SONAR_TIMEOUT_MS = 8000;
const SONAR_WINDOW_MS = 4 * 60 * 60 * 1000;

const sonarWindowCache = new Map<string, Promise<SonarSignal | null>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cycleWindowBucket(nowMs: number): string {
  return String(Math.floor(nowMs / SONAR_WINDOW_MS));
}

function cacheKey(lane: SonarLane, cycleId: string, recency: SonarRecency): string {
  return `${lane}|${cycleId}|${cycleWindowBucket(Date.now())}|${recency}`;
}

function normalizeSource(value: unknown): SonarSource | null {
  if (!isRecord(value)) return null;
  const urlRaw = value.url;
  const titleRaw = value.title;
  const url = typeof urlRaw === 'string' ? urlRaw.trim() : '';
  if (!url) return null;
  const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : url;
  return { title, url };
}

function parseSonarResponse(payload: unknown): { answer: string; sources: SonarSource[] } {
  if (!isRecord(payload)) return { answer: '', sources: [] };

  const choicesRaw = payload.choices;
  let answer = '';
  if (Array.isArray(choicesRaw) && choicesRaw[0] && isRecord(choicesRaw[0])) {
    const firstChoice = choicesRaw[0];
    const messageRaw = firstChoice.message;
    if (isRecord(messageRaw)) {
      const content = messageRaw.content;
      if (typeof content === 'string') answer = content.trim();
    }
  }

  const citationsRaw = payload.citations;
  const sources = Array.isArray(citationsRaw)
    ? citationsRaw
        .map((item) => (typeof item === 'string' ? { title: item, url: item } : normalizeSource(item)))
        .filter((item): item is SonarSource => item !== null)
    : [];

  return { answer, sources };
}

export async function querySonar(
  prompt: string,
  recency: SonarRecency = 'day',
): Promise<SonarSignal> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY is not configured');
  }

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(SONAR_TIMEOUT_MS),
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: prompt }],
      search_recency_filter: recency,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Perplexity Sonar request failed (${res.status})`);
  }

  const json = (await res.json()) as unknown;
  const parsed = parseSonarResponse(json);

  return {
    query: prompt,
    answer: parsed.answer,
    sources: parsed.sources,
    recency,
    timestamp: new Date().toISOString(),
  };
}

export function querySonarForLane(
  lane: SonarLane,
  prompt: string,
  recency: SonarRecency = 'day',
  cycleId = currentCycleId(),
): Promise<SonarSignal | null> {
  const key = cacheKey(lane, cycleId, recency);
  const existing = sonarWindowCache.get(key);
  if (existing) return existing;

  const pending = querySonar(prompt, recency)
    .then((result) => result)
    .catch(() => null);

  sonarWindowCache.set(key, pending);
  return pending;
}
