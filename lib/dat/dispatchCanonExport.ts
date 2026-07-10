/**
 * Dispatch reserve-block-canon-export workflow on this repo.
 * EPICON: C-368 PR7 | RESERVE_BLOCK_DAT_CANONIZATION
 */

const GITHUB_API = 'https://api.github.com';
const WORKFLOW_FILE = 'reserve-block-canon-export.yml';

export type DispatchCanonExportResult =
  | { ok: true; status: number }
  | { ok: false; error: string; status?: number };

function resolveGithubToken(): string | null {
  const candidates = [
    process.env.SUBSTRATE_GITHUB_TOKEN,
    process.env.GITHUB_TOKEN,
    process.env.MOBIUS_BOT_GITHUB_TOKEN,
  ];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function resolveTerminalRepo(): string {
  const explicit =
    process.env.MOBIUS_TERMINAL_GITHUB_REPO?.trim() ||
    process.env.SLACK_AGENT_GITHUB_REPO?.trim() ||
    process.env.GITHUB_REPOSITORY?.trim();
  if (explicit?.includes('/')) return explicit;
  return 'kaizencycle/mobius-civic-ai-terminal';
}

export async function dispatchCanonExportWorkflow(args: {
  incremental?: boolean;
  dryRun?: boolean;
  openSubstratePr?: boolean;
  ref?: string;
}): Promise<DispatchCanonExportResult> {
  const token = resolveGithubToken();
  if (!token) {
    return { ok: false, error: 'GITHUB_TOKEN or SUBSTRATE_GITHUB_TOKEN not configured' };
  }

  const repo = resolveTerminalRepo();
  const ref = (args.ref ?? process.env.CANON_EXPORT_GITHUB_REF ?? 'main').replace(/^refs\/heads\//, '');
  const url = `${GITHUB_API}/repos/${repo}/actions/workflows/${encodeURIComponent(WORKFLOW_FILE)}/dispatches`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      ref,
      inputs: {
        incremental: args.incremental === false ? 'false' : 'true',
        dry_run: args.dryRun ? 'true' : 'false',
        open_substrate_pr: args.openSubstratePr === false ? 'false' : 'true',
      },
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (res.status === 204 || res.status === 200) {
    return { ok: true, status: res.status };
  }

  let detail = '';
  try {
    const json = (await res.json()) as { message?: string };
    detail = json.message ? `: ${json.message}` : '';
  } catch {
    /* ignore */
  }

  return { ok: false, error: `workflow_dispatch_failed${detail}`, status: res.status };
}
