/**
 * C-322 — GitHub-backed cold tier for slow-changing Terminal state.
 *
 * READ:  `raw.githubusercontent.com` (CDN, no auth for public repos).
 * WRITE: GitHub Contents API (requires PAT with `contents:write` on the target repo).
 *
 * Mobius integrity: callers must not treat CDN reads as live KV; `loadGIState` marks
 * `source: 'cached'` when this layer supplies the row. Writes are best-effort and
 * must stay low-frequency (heartbeat mirror), not per-request.
 */

const UA = 'mobius-civic-ai-terminal/1.0 (github-state-cache)';

function utf8ToBase64(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function githubRepoConfig(): { owner: string; repo: string; branch: string } | null {
  const owner = process.env.GH_CACHE_OWNER?.trim() || 'kaizencycle';
  const repo = process.env.GH_CACHE_REPO?.trim();
  const branch = process.env.GH_CACHE_BRANCH?.trim() || 'main';
  if (!repo) return null;
  return { owner, repo, branch };
}

function githubPat(): string | null {
  return process.env.GH_CACHE_PAT?.trim() || process.env.GITHUB_PAT?.trim() || null;
}

function encodedStatePath(pathUnderState: string): string {
  const clean = pathUnderState.replace(/^\/+/, '');
  return clean
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function rawUrl(pathUnderState: string): string | null {
  const c = githubRepoConfig();
  if (!c) return null;
  const clean = pathUnderState.replace(/^\/+/, '');
  return `https://raw.githubusercontent.com/${c.owner}/${c.repo}/${c.branch}/STATE/${clean}`;
}

function contentsApiUrl(pathUnderState: string): string | null {
  const c = githubRepoConfig();
  if (!c) return null;
  return `https://api.github.com/repos/${c.owner}/${c.repo}/contents/STATE/${encodedStatePath(pathUnderState)}`;
}

/**
 * Read JSON from the GitHub CDN tier. Returns null if unconfigured, missing, or invalid JSON.
 */
export async function githubStateReadJson<T>(pathUnderState: string): Promise<T | null> {
  const url = rawUrl(pathUnderState);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Upsert a JSON file under `STATE/` via Contents API. One 409 retry (stale SHA).
 * Returns false on missing PAT, transport error, or persistent conflict.
 */
export async function githubStateWriteJson(
  pathUnderState: string,
  data: unknown,
  message: string,
): Promise<boolean> {
  const api = contentsApiUrl(pathUnderState);
  const c = githubRepoConfig();
  const pat = githubPat();
  if (!api || !c || !pat) {
    console.warn('[github-state-cache] write skipped: GH_CACHE_REPO or PAT not configured');
    return false;
  }

  const bodyJson = `${JSON.stringify(data, null, 2)}\n`;
  const content = utf8ToBase64(bodyJson);
  const authHeaders: Record<string, string> = {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': UA,
    'Content-Type': 'application/json',
  };

  const readHeaders: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': UA,
    ...(pat ? { Authorization: `Bearer ${pat}` } : {}),
  };

  const put = async (sha?: string): Promise<boolean> => {
    const payload: Record<string, unknown> = {
      message: `${message} [skip ci]`,
      content,
      branch: c.branch,
    };
    if (sha) payload.sha = sha;
    const res = await fetch(api, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25_000),
    });
    if (res.ok) return true;
    if (res.status === 409) return false;
    const err = await res.text().catch(() => '');
    console.error(`[github-state-cache] write failed ${pathUnderState}: ${res.status} ${err.slice(0, 400)}`);
    return false;
  };

  try {
    const getRes = await fetch(api, { headers: readHeaders, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    const existingSha =
      getRes.ok ? ((await getRes.json()) as { sha?: string }).sha : undefined;

    if (await put(existingSha)) return true;
    // 409 — re-fetch SHA once
    const retryGet = await fetch(api, { headers: readHeaders, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    const sha2 = retryGet.ok ? ((await retryGet.json()) as { sha?: string }).sha : undefined;
    return put(sha2);
  } catch (e) {
    console.error(`[github-state-cache] write exception ${pathUnderState}:`, e instanceof Error ? e.message : e);
    return false;
  }
}

export function isGithubStateCacheConfigured(): boolean {
  return githubRepoConfig() !== null;
}

export function isGithubStateWriteConfigured(): boolean {
  return githubRepoConfig() !== null && githubPat() !== null;
}
