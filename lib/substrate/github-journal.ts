const SUBSTRATE_REPO = 'kaizencycle/Mobius-Substrate';
const GITHUB_API = 'https://api.github.com';

const GITHUB_TOKEN = process.env.SUBSTRATE_GITHUB_TOKEN;

/** Persisted journal JSON under Mobius-Substrate `journals/{agent}/`. */
export interface SubstrateJournalEntry {
  id: string;
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
  timestamp: string;
  /** Terminal journal lane status when bridged from the app. */
  status?: string;
}

/** Input for GitHub write: server assigns `id` and ISO `timestamp` when omitted. */
export type SubstrateJournalWriteInput = Omit<SubstrateJournalEntry, 'id' | 'timestamp'> & {
  id?: string;
};

export async function writeJournalToSubstrate(
  entry: SubstrateJournalWriteInput,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!GITHUB_TOKEN) {
    console.error('[substrate] SUBSTRATE_GITHUB_TOKEN not set');
    return { ok: false, error: 'token_missing' };
  }

  const timestampIso = new Date().toISOString();
  const fileStamp = timestampIso.replace(/:/g, '-').replace(/\./g, '-');
  const agent = entry.agent.toLowerCase();
  const path = `journals/${agent}/${fileStamp}-journal.json`;

  const id = entry.id ?? `journal-${agent}-${Date.now()}`;

  const payload: SubstrateJournalEntry = {
    ...entry,
    id,
    timestamp: timestampIso,
  };

  const content = Buffer.from(JSON.stringify(payload, null, 2)).toString('base64');

  try {
    const res = await fetch(`${GITHUB_API}/repos/${SUBSTRATE_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        message: `${agent}: journal · ${entry.cycle} [skip ci]`,
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
      console.error(`[substrate] write failed ${res.status}: ${err}`);
      return { ok: false, error: `github_${res.status}` };
    }

    return { ok: true, path };
  } catch (err) {
    console.error('[substrate] write error:', err);
    return { ok: false, error: String(err) };
  }
}
