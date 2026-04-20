/**
 * GitHub API helpers for Mobius Slack Agent — draft PR + workflow_dispatch.
 * Uses operator-provided token; never invents success.
 */

const GITHUB_API = 'https://api.github.com';

export type GithubDispatchResult =
  | { ok: true; status: number; workflow_id: string; html_url?: string }
  | { ok: false; error: string; status?: number };

export type GithubDraftPrResult =
  | { ok: true; status: number; html_url: string; number: number }
  | { ok: false; error: string; status?: number };

function bearer(): string | null {
  const t = process.env.GITHUB_TOKEN?.trim();
  return t && t.length > 0 ? t : null;
}

/** owner/repo for this Terminal repo when dispatching / opening PRs from Slack. */
export function resolveSlackAgentGithubRepo(): string | null {
  const explicit =
    process.env.SLACK_AGENT_GITHUB_REPO?.trim() ||
    process.env.MOBIUS_GITHUB_REPO?.trim() ||
    process.env.GITHUB_REPOSITORY?.trim();
  if (explicit && explicit.includes('/')) return explicit;

  const vercel = process.env.VERCEL_GIT_REPOSITORY_URL?.trim();
  if (vercel) {
    try {
      const u = new URL(vercel.replace(/^git@github\.com:/, 'https://github.com/'));
      const path = u.pathname.replace(/^\/|\/$/g, '');
      if (path.endsWith('.git')) return path.slice(0, -4);
      if (path.includes('/')) return path;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function slackAgentWorkflowFilename(workflowId: string): string {
  const map: Record<string, string> = {
    'publish-cycle-state': 'publish-cycle-state.yml',
    'fetch-hive-world': 'fetch-hive-world.yml',
    'mesh-aggregate': 'mesh-aggregate.yml',
    'world-update': 'world-update.yml',
  };
  return map[workflowId] ?? `${workflowId}.yml`;
}

export async function dispatchGithubWorkflow(args: {
  repo: string;
  workflowId: string;
  ref?: string;
}): Promise<GithubDispatchResult> {
  const token = bearer();
  if (!token) {
    return { ok: false, error: 'GITHUB_TOKEN not set (needs repo workflow scope)' };
  }
  const file = slackAgentWorkflowFilename(args.workflowId);
  const ref = (args.ref ?? process.env.SLACK_AGENT_GITHUB_REF?.trim() ?? 'main').replace(/^refs\/heads\//, '');
  const url = `${GITHUB_API}/repos/${args.repo}/actions/workflows/${encodeURIComponent(file)}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref }),
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 204 || res.status === 200) {
    return { ok: true, status: res.status, workflow_id: args.workflowId };
  }
  let detail = '';
  try {
    const j = (await res.json()) as { message?: string };
    detail = j.message ? `: ${j.message}` : '';
  } catch {
    /* ignore */
  }
  return { ok: false, error: `github_dispatch_failed${detail}`, status: res.status };
}

export async function createGithubDraftPullRequest(args: {
  repo: string;
  title: string;
  headBranch: string;
  baseBranch?: string;
}): Promise<GithubDraftPrResult> {
  const token = bearer();
  if (!token) {
    return { ok: false, error: 'GITHUB_TOKEN not set (needs contents + pull_requests)' };
  }
  const base = args.baseBranch?.trim() || process.env.SLACK_AGENT_GITHUB_BASE?.trim() || 'main';
  const url = `${GITHUB_API}/repos/${args.repo}/pulls`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title: args.title,
      head: args.headBranch,
      base,
      draft: true,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as { message?: string };
      detail = j.message ? `: ${j.message}` : '';
    } catch {
      /* ignore */
    }
    return { ok: false, error: `github_pr_create_failed${detail}`, status: res.status };
  }
  const data = (await res.json()) as { html_url?: string; number?: number };
  const html = typeof data.html_url === 'string' ? data.html_url : '';
  const num = typeof data.number === 'number' ? data.number : 0;
  if (!html) return { ok: false, error: 'github_pr_missing_html_url', status: res.status };
  return { ok: true, status: res.status, html_url: html, number: num };
}

export async function createGithubBranchRef(args: {
  repo: string;
  branchName: string;
  fromSha: string;
}): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const token = bearer();
  if (!token) {
    return { ok: false, error: 'GITHUB_TOKEN not set' };
  }
  const url = `${GITHUB_API}/repos/${args.repo}/git/refs`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      ref: `refs/heads/${args.branchName}`,
      sha: args.fromSha,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 201) return { ok: true };
  let detail = '';
  try {
    const j = (await res.json()) as { message?: string };
    detail = j.message ? `: ${j.message}` : '';
  } catch {
    /* ignore */
  }
  return { ok: false, error: `github_ref_create_failed${detail}`, status: res.status };
}

export async function getDefaultBranchSha(repo: string): Promise<{ ok: true; sha: string } | { ok: false; error: string }> {
  const token = bearer();
  if (!token) {
    return { ok: false, error: 'GITHUB_TOKEN not set' };
  }
  const url = `${GITHUB_API}/repos/${repo}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    return { ok: false, error: `github_repo_meta_${res.status}` };
  }
  const data = (await res.json()) as { default_branch?: string };
  const branch = typeof data.default_branch === 'string' ? data.default_branch : 'main';
  const refUrl = `${GITHUB_API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const refRes = await fetch(refUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!refRes.ok) {
    return { ok: false, error: `github_ref_resolve_${refRes.status}` };
  }
  const refData = (await refRes.json()) as { object?: { sha?: string } };
  const sha = refData.object?.sha;
  if (typeof sha !== 'string' || sha.length < 7) {
    return { ok: false, error: 'github_ref_missing_sha' };
  }
  return { ok: true, sha };
}

export async function getRepoFileSha(args: {
  repo: string;
  path: string;
  branch: string;
}): Promise<{ ok: true; sha: string | null } | { ok: false; error: string }> {
  const token = bearer();
  if (!token) {
    return { ok: false, error: 'GITHUB_TOKEN not set' };
  }
  const pathInUrl = args.path.split('/').map(encodeURIComponent).join('/');
  const url = `${GITHUB_API}/repos/${args.repo}/contents/${pathInUrl}?ref=${encodeURIComponent(args.branch)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 404) {
    return { ok: true, sha: null };
  }
  if (!res.ok) {
    return { ok: false, error: `github_contents_get_${res.status}` };
  }
  const data = (await res.json()) as { sha?: string };
  return { ok: true, sha: typeof data.sha === 'string' ? data.sha : null };
}

export async function putRepoFileOnBranch(args: {
  repo: string;
  path: string;
  branch: string;
  message: string;
  contentUtf8: string;
  /** When updating an existing blob */
  sha?: string;
}): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const token = bearer();
  if (!token) {
    return { ok: false, error: 'GITHUB_TOKEN not set' };
  }
  const pathInUrl = args.path.split('/').map(encodeURIComponent).join('/');
  const url = `${GITHUB_API}/repos/${args.repo}/contents/${pathInUrl}`;
  const body: Record<string, string> = {
    message: args.message,
    content: Buffer.from(args.contentUtf8, 'utf8').toString('base64'),
    branch: args.branch,
  };
  if (args.sha) body.sha = args.sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 200 || res.status === 201) return { ok: true };
  let detail = '';
  try {
    const j = (await res.json()) as { message?: string };
    detail = j.message ? `: ${j.message}` : '';
  } catch {
    /* ignore */
  }
  return { ok: false, error: `github_contents_put_failed${detail}`, status: res.status };
}
