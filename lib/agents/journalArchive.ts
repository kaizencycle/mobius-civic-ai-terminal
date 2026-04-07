interface JournalArchiveEntry {
  id: string;
  agent: string;
  cycle: string;
  timestamp: string;
  scope: string;
  observation: string;
  inference: string;
  recommendation: string;
  confidence: number;
  derivedFrom: string[];
  status: 'draft' | 'committed' | 'contested' | 'verified';
  category: 'observation' | 'inference' | 'alert' | 'recommendation' | 'close';
  severity: 'nominal' | 'elevated' | 'critical';
  source: 'agent-journal';
  agentOrigin: string;
  tags?: string[];
}

interface GitHubContentFile {
  type: 'file' | 'dir';
  name: string;
  path: string;
  download_url: string | null;
}

const REPO_OWNER = 'kaizencycle';
const REPO_NAME = 'Mobius-Substrate';
const REPO_BRANCH = 'main';
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}`;

function toAgentSlug(agent: string): string {
  return agent.trim().toLowerCase();
}

function buildGitHubHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function writeJournalEntryToArchive(entry: JournalArchiveEntry): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;

  const agentSlug = toAgentSlug(entry.agent);
  const safeTimestamp = new Date(entry.timestamp).toISOString().replace(/[.:]/g, '-');
  const filename = `docs/catalog/${agentSlug}/${safeTimestamp}-journal.json`;

  const response = await fetch(`${API_BASE}/contents/${filename}`, {
    method: 'PUT',
    headers: buildGitHubHeaders(),
    body: JSON.stringify({
      message: `${agentSlug}: journal entry · ${entry.cycle} [skip ci]`,
      content: Buffer.from(JSON.stringify(entry, null, 2)).toString('base64'),
      branch: REPO_BRANCH,
      committer: {
        name: entry.agent,
        email: `${agentSlug}@mobius.systems`,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub archive write failed (${response.status}): ${errorText}`);
  }
}

async function listPath(path: string): Promise<GitHubContentFile[]> {
  const listResponse = await fetch(`${API_BASE}/contents/${path}?ref=${REPO_BRANCH}`, {
    headers: buildGitHubHeaders(),
    next: { revalidate: 0 },
  });

  if (!listResponse.ok) return [];
  return (await listResponse.json()) as GitHubContentFile[];
}

export async function readJournalEntriesFromArchive(agent?: string, limit = 10): Promise<JournalArchiveEntry[]> {
  const safeLimit = Math.max(1, Math.min(limit, 25));
  let files: GitHubContentFile[] = [];

  if (agent) {
    const agentItems = await listPath(`docs/catalog/${toAgentSlug(agent)}`);
    files = agentItems.filter((item) => item.type === 'file' && item.name.endsWith('-journal.json'));
  } else {
    const rootItems = await listPath('docs/catalog');
    const directories = rootItems.filter((item) => item.type === 'dir');
    const batches = await Promise.all(directories.map((dir) => listPath(dir.path)));
    files = batches
      .flat()
      .filter((item) => item.type === 'file' && item.name.endsWith('-journal.json'));
  }

  const recent = files.sort((a, b) => b.name.localeCompare(a.name)).slice(0, safeLimit);

  const entries = await Promise.all(
    recent.map(async (file) => {
      const rawUrl = file.download_url ?? `${RAW_BASE}/${file.path}`;
      const response = await fetch(rawUrl, { next: { revalidate: 0 } });
      if (!response.ok) return null;
      const payload = (await response.json()) as JournalArchiveEntry;
      return payload;
    }),
  );

  return entries.filter((entry): entry is JournalArchiveEntry => entry !== null);
}
