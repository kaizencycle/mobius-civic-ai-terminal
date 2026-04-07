import type { JournalStoredRecord } from '@/lib/substrate/github-journal';

const SUBSTRATE_REPO = 'kaizencycle/Mobius-Substrate';

const AGENT_SLUGS = ['atlas', 'zeus', 'eve', 'hermes', 'aurea', 'jade', 'daedalus', 'echo'] as const;

type GitHubContentItem = {
  type: string;
  name: string;
  download_url: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJournalStoredRecord(value: unknown): value is JournalStoredRecord {
  if (!isRecord(value)) return false;
  const id = value.id;
  const agent = value.agent;
  const timestamp = value.timestamp;
  const cycle = value.cycle;
  const scope = value.scope;
  const category = value.category;
  const severity = value.severity;
  const observation = value.observation;
  const inference = value.inference;
  const recommendation = value.recommendation;
  const confidence = value.confidence;
  const derivedFrom = value.derivedFrom;
  const source = value.source;
  const tags = value.tags;
  const agentOrigin = value.agentOrigin;

  const tagsOk =
    tags === undefined || (Array.isArray(tags) && tags.every((x): x is string => typeof x === 'string'));

  return (
    typeof id === 'string' &&
    typeof agent === 'string' &&
    typeof timestamp === 'string' &&
    typeof cycle === 'string' &&
    typeof scope === 'string' &&
    typeof category === 'string' &&
    typeof severity === 'string' &&
    typeof observation === 'string' &&
    typeof inference === 'string' &&
    typeof recommendation === 'string' &&
    typeof confidence === 'number' &&
    Number.isFinite(confidence) &&
    Array.isArray(derivedFrom) &&
    derivedFrom.every((x): x is string => typeof x === 'string') &&
    typeof source === 'string' &&
    tagsOk &&
    typeof agentOrigin === 'string'
  );
}

export async function readAgentJournal(agent: string, limit = 10): Promise<JournalStoredRecord[]> {
  const agentLower = agent.toLowerCase();

  const listRes = await fetch(
    `https://api.github.com/repos/${SUBSTRATE_REPO}/contents/docs/catalog/${agentLower}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(5000),
    },
  ).catch(() => null);

  if (!listRes?.ok) return [];

  const rawList: unknown = await listRes.json();
  if (!Array.isArray(rawList)) return [];

  const files = rawList.filter((item): item is GitHubContentItem => {
    if (!isRecord(item)) return false;
    return typeof item.type === 'string' && typeof item.name === 'string';
  });

  const journalFiles = files
    .filter((f) => f.type === 'file' && f.name.endsWith('-journal.json') && f.name !== '.gitkeep')
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, limit);

  const entries = await Promise.allSettled(
    journalFiles.map(async (f) => {
      const url = f.download_url;
      if (!url) return null;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      const json: unknown = await res.json();
      return isJournalStoredRecord(json) ? json : null;
    }),
  );

  return entries
    .filter((r): r is PromiseFulfilledResult<JournalStoredRecord | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is JournalStoredRecord => v !== null);
}

export async function readAllAgentJournals(limit = 5): Promise<Record<string, JournalStoredRecord[]>> {
  const results = await Promise.allSettled(
    AGENT_SLUGS.map(async (a) => ({
      agent: a,
      entries: await readAgentJournal(a, limit),
    })),
  );

  const pairs: [string, JournalStoredRecord[]][] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      pairs.push([r.value.agent, r.value.entries]);
    }
  }
  return Object.fromEntries(pairs);
}
