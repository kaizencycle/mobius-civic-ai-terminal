const SUBSTRATE_REPO = 'kaizencycle/Mobius-Substrate';
const SUBSTRATE_API = 'https://api.github.com';
const GITHUB_TOKEN = process.env.SUBSTRATE_GITHUB_TOKEN;

export interface JournalEntry {
  agent: string;
  agentOrigin: string;
  cycle: string;
  scope: string;
  category: string;
  severity: string;
  observation: string;
  inference: string;
  recommendation: string;
  confidence: number;
  derivedFrom: string[];
  source: string;
  tags: string[];
  gi_at_time?: number;
  /** When set (e.g. from terminal KV), reused so GET merge can dedupe on `id`. */
  id?: string;
  /** Persisted for round-trip with terminal `AgentJournalEntry`. */
  status?: string;
}

/** Shape of a journal JSON file in Mobius-Substrate `docs/catalog/{agent}/`. */
export type JournalStoredRecord = JournalEntry & {
  id: string;
  timestamp: string;
};

export async function writeJournalToSubstrate(
  entry: JournalEntry,
): Promise<{ ok: boolean; path?: string; sha?: string; error?: string }> {
  if (!GITHUB_TOKEN) {
    console.error('[substrate] SUBSTRATE_GITHUB_TOKEN not set');
    return { ok: false, error: 'token_missing' };
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
  const agent = entry.agent.toLowerCase();
  const path = `docs/catalog/${agent}/${timestamp}-journal.json`;

  const payload: Record<string, unknown> = {
    ...entry,
    timestamp,
    id: entry.id ?? `journal-${agent}-${Date.now()}`,
    status: entry.status ?? 'committed',
    source: entry.source || 'agent-journal',
  };

  const content = Buffer.from(JSON.stringify(payload, null, 2)).toString('base64');

  try {
    const res = await fetch(`${SUBSTRATE_API}/repos/${SUBSTRATE_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        message: `${agent}: journal entry · ${entry.cycle} [skip ci]`,
        content,
        committer: {
          name: entry.agent,
          email: `${agent}@mobius.systems`,
        },
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[substrate] github write failed ${res.status}: ${err}`);
      return { ok: false, error: `github_${res.status}` };
    }

    const data = (await res.json()) as { content?: { sha?: string } };
    return {
      ok: true,
      path,
      sha: data.content?.sha,
    };
  } catch (err) {
    console.error('[substrate] github write error:', err);
    return { ok: false, error: String(err) };
  }
}
