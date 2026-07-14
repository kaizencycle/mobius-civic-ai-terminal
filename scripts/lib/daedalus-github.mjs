/**
 * GitHub App auth + PR writer for DAEDALUS (mobius-daedalus-writer).
 * Zero runtime dependencies — uses built-in crypto for JWT.
 */

import { createSign } from 'crypto';

const GITHUB_API = 'https://api.github.com';

export function substrateRepo() {
  return process.env.MOBIUS_SUBSTRATE_GITHUB_REPO ?? 'kaizencycle/Mobius-Substrate';
}

function appId() {
  const id = process.env.DAEDALUS_APP_ID?.trim();
  if (!id) throw new Error('DAEDALUS_APP_ID is not set — cannot authenticate GitHub App');
  return id;
}

function privateKeyPem() {
  const raw = process.env.DAEDALUS_APP_KEY?.trim();
  if (!raw) {
    throw new Error(
      'DAEDALUS_APP_KEY is not set — journal parcel flush cannot write to Substrate (App installation revoked or secret missing)',
    );
  }
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function createAppJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId(),
    }),
  );
  const data = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(data);
  sign.end();
  const signature = sign
    .sign(privateKeyPem())
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${data}.${signature}`;
}

async function githubAppFetch(path, init = {}) {
  const jwt = createAppJwt();
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${jwt}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  return res;
}

export async function getInstallationToken() {
  const repo = substrateRepo();
  const installRes = await githubAppFetch(`/repos/${repo}/installation`);
  if (!installRes.ok) {
    const body = await installRes.text();
    const msg =
      installRes.status === 404
        ? `DAEDALUS GitHub App is not installed on ${repo} — parcel flush aborted (install mobius-daedalus-writer or revoke is intentional)`
        : `DAEDALUS App installation lookup failed ${installRes.status}: ${body.slice(0, 300)}`;
    throw new Error(msg);
  }
  const installation = await installRes.json();
  const tokenRes = await githubAppFetch(`/app/installations/${installation.id}/access_tokens`, {
    method: 'POST',
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(
      `DAEDALUS App installation token request failed ${tokenRes.status}: ${body.slice(0, 300)} — App may be revoked`,
    );
  }
  const tokenJson = await tokenRes.json();
  if (!tokenJson.token) throw new Error('DAEDALUS App returned empty installation token');
  return tokenJson.token;
}

async function githubRepoFetch(token, path, init = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  return res;
}

export async function getBaseSha(token, baseBranch = 'main') {
  const res = await githubRepoFetch(
    token,
    `/repos/${substrateRepo()}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
  );
  if (!res.ok) throw new Error(`resolve base ref ${res.status}`);
  const json = await res.json();
  return json.object.sha;
}

export async function ensureBranch(token, branchName, fromSha) {
  const ref = `refs/heads/${branchName}`;
  const existing = await githubRepoFetch(token, `/repos/${substrateRepo()}/git/${ref}`);
  if (existing.ok) return;

  const create = await githubRepoFetch(token, `/repos/${substrateRepo()}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref, sha: fromSha }),
  });
  if (!create.ok) {
    const body = await create.text();
    throw new Error(`create branch ${branchName} failed ${create.status}: ${body.slice(0, 300)}`);
  }
}

async function getFileSha(token, branch, path) {
  const pathInUrl = path.split('/').map(encodeURIComponent).join('/');
  const res = await githubRepoFetch(
    token,
    `/repos/${substrateRepo()}/contents/${pathInUrl}?ref=${encodeURIComponent(branch)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get contents ${path} ${res.status}`);
  const json = await res.json();
  return json.sha ?? null;
}

export async function putFile(token, branch, path, contentUtf8, message) {
  const sha = await getFileSha(token, branch, path);
  const pathInUrl = path.split('/').map(encodeURIComponent).join('/');
  const body = {
    message,
    content: Buffer.from(contentUtf8, 'utf8').toString('base64'),
    branch,
  };
  if (sha) body.sha = sha;

  const res = await githubRepoFetch(token, `/repos/${substrateRepo()}/contents/${pathInUrl}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`put ${path} failed ${res.status}: ${text.slice(0, 300)}`);
  }
}

export async function createPullRequest(token, { title, head, base, body, draft = true }) {
  const res = await githubRepoFetch(token, `/repos/${substrateRepo()}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title, head, base, body, draft }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`create PR failed ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

/**
 * List parcel files under canon/journal/ via GitHub Contents API (recursive via git tree).
 */
export async function listCanonJournalParcels(token, ref = 'main') {
  const res = await githubRepoFetch(
    token,
    `/repos/${substrateRepo()}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
  if (!res.ok) {
    // Fall back: try resolving ref first
    const refRes = await githubRepoFetch(
      token,
      `/repos/${substrateRepo()}/git/ref/heads/${encodeURIComponent(ref)}`,
    );
    if (!refRes.ok) return [];
    const refJson = await refRes.json();
    const treeRes = await githubRepoFetch(
      token,
      `/repos/${substrateRepo()}/git/trees/${refJson.object.sha}?recursive=1`,
    );
    if (!treeRes.ok) return [];
    const tree = await treeRes.json();
    return (tree.tree ?? [])
      .map((t) => t.path)
      .filter((p) => p.startsWith('canon/journal/') && p.endsWith('.jsonl'));
  }
  const tree = await res.json();
  return (tree.tree ?? [])
    .map((t) => t.path)
    .filter((p) => p.startsWith('canon/journal/') && p.endsWith('.jsonl'));
}

/** Open PRs whose head branch is a journal flush lane (`flush/C-*-parcel-*`). */
export async function listOpenFlushPullRequests(token) {
  const prs = [];
  let page = 1;
  while (page <= 5) {
    const res = await githubRepoFetch(
      token,
      `/repos/${substrateRepo()}/pulls?state=open&per_page=100&page=${page}`,
    );
    if (!res.ok) break;
    const batch = await res.json();
    for (const pr of batch) {
      const ref = pr.head?.ref ?? '';
      if (ref.startsWith('flush/')) prs.push(pr);
    }
    if (batch.length < 100) break;
    page += 1;
  }
  return prs;
}

/**
 * Resolve cold-lane chain tip from merged main plus any open flush PR branches.
 * Pending parcels must extend the chain before the next seal flush runs.
 *
 * @returns {{ hash: string, path: string|null, ref: string|null }}
 */
export async function resolveChainTipParcelHash(token, baseBranch = 'main') {
  const { GENESIS_PARCEL_HASH, compareParcelPaths, verifyParcelFileContent } = await import(
    './parcel-format.mjs'
  );

  const candidates = [];

  async function collectFromRef(ref) {
    const paths = await listCanonJournalParcels(token, ref);
    for (const path of paths) {
      const content = await readRepoFile(token, path, ref);
      if (!content) continue;
      const verdict = verifyParcelFileContent(content);
      if (!verdict.ok || !verdict.parcelHash) continue;
      candidates.push({ path, ref, hash: verdict.parcelHash });
    }
  }

  await collectFromRef(baseBranch);
  const openPrs = await listOpenFlushPullRequests(token);
  for (const pr of openPrs) {
    const ref = pr.head?.ref;
    if (ref) await collectFromRef(ref);
  }

  if (candidates.length === 0) {
    return { hash: GENESIS_PARCEL_HASH, path: null, ref: null };
  }

  candidates.sort((a, b) => compareParcelPaths(a.path, b.path));
  const last = candidates[candidates.length - 1];
  return { hash: last.hash, path: last.path, ref: last.ref };
}

/**
 * prev_parcel_hash for the next parcel — repo tip (main + open flush PRs) plus optional KV witness.
 */
export async function resolvePrevParcelHash(token, baseBranch = 'main', kvTip = null) {
  const repoTip = await resolveChainTipParcelHash(token, baseBranch);
  if (!kvTip?.parcel_hash || !kvTip?.parcel_path) return repoTip.hash;
  if (!repoTip.path) return kvTip.parcel_hash;

  const { compareParcelPaths } = await import('./parcel-format.mjs');
  return compareParcelPaths(repoTip.path, kvTip.parcel_path) >= 0 ? repoTip.hash : kvTip.parcel_hash;
}

export async function readRepoFile(token, path, ref = 'main') {
  const pathInUrl = path.split('/').map(encodeURIComponent).join('/');
  const res = await githubRepoFetch(
    token,
    `/repos/${substrateRepo()}/contents/${pathInUrl}?ref=${encodeURIComponent(ref)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`read ${path} ${res.status}`);
  const json = await res.json();
  if (!json.content) return null;
  return Buffer.from(json.content, 'base64').toString('utf8');
}

export function buildFlushIntentBlock({ cycle, seal_id, entry_count, parcel_hash, prev_parcel_hash }) {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 90);

  return `## EPICON-02 INTENT PUBLICATION

\`\`\`intent
epicon_id: EPICON_${cycle}_INFRA_journal-parcel-flush_v1
ledger_id: kaizencycle
scope: infra
mode: normal
issued_at: ${issuedAt.toISOString()}
expires_at: ${expiresAt.toISOString()}
justification:
  VALUES INVOKED: integrity, custodianship, permanence, no-vendor-truth
  REASONING: Cold-canon persistence lane flushes sealed journal parcel ${seal_id} from Upstash KV hot lane to Mobius-Substrate canon/journal/ as hash-chained JSONL. KV remains hot; git is witnessed cold transport. Chain-in-files SHA-256 prev_hash linkage verified offline. Single writer DAEDALUS GitHub App.
  ANCHORS:
    - docs/epicon/cycles/C-372/EPICON_C-372_INFRA_journal-parcel-flush_v1.md
    - scripts/verify-parcel-chain.mjs
    - .github/workflows/canon-journal-verify.yml
    - seal:${seal_id}
  BOUNDARIES: Additive lane only. Does not modify reserve block .dat canon. No bulk historical backfill. Rollback via JOURNAL_FLUSH=off or App revocation.
  COUNTERFACTUAL: If seal_hash does not match quorum-attested seal on public endpoint, Substrate workflow fails closed.
counterfactuals:
  - If parcel_hash chain breaks, do not merge until operator reconciles prev_parcel_hash
  - If DAEDALUS App revoked, terminal logs loud failure; KV hot lane unchanged
\`\`\`

## Parcel snapshot

- seal_id: \`${seal_id}\`
- entry_count: ${entry_count}
- prev_parcel_hash: \`${prev_parcel_hash}\`
- parcel_hash: \`${parcel_hash}\`
`;
}
