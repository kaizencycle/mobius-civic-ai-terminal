#!/usr/bin/env node
/**
 * Open a draft PR on Mobius-Substrate with exported .dat canon files.
 * EPICON: C-368 PR7 | RESERVE_BLOCK_DAT_CANONIZATION
 *
 * Usage:
 *   node scripts/open-substrate-canon-pr.mjs \
 *     --source ./canon/reserve-blocks \
 *     --branch canon/reserve-blocks-prime-c368 \
 *     --title "canon(C-368): prime reserve blocks cold canon"
 */

import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const GITHUB_API = 'https://api.github.com';
const SUBSTRATE_REPO = process.env.MOBIUS_SUBSTRATE_GITHUB_REPO ?? 'kaizencycle/Mobius-Substrate';

function parseArgs(argv) {
  const args = {
    source: './canon/reserve-blocks',
    branch: `canon/reserve-blocks-append-${new Date().toISOString().slice(0, 10)}`,
    title: 'canon(C-368): reserve block cold canon append',
    base: 'main',
    cycle: 'C-368',
    prime: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--prime') args.prime = true;
    else if (arg.startsWith('--source=')) args.source = arg.split('=')[1];
    else if (arg.startsWith('--branch=')) args.branch = arg.split('=')[1];
    else if (arg.startsWith('--title=')) args.title = arg.split('=')[1];
    else if (arg.startsWith('--base=')) args.base = arg.split('=')[1];
    else if (arg.startsWith('--cycle=')) args.cycle = arg.split('=')[1];
  }

  if (args.prime) {
    args.branch = 'canon/reserve-blocks-prime-c368';
    args.title = 'canon(C-368): prime reserve blocks cold canon';
  }

  return args;
}

function formatGitHubApiError(status, body, operation) {
  const base = `${operation} failed ${status}: ${body}`;
  if (status !== 403) return base;

  const hints = [
    'SUBSTRATE_GITHUB_TOKEN lacks write access to kaizencycle/Mobius-Substrate.',
    'Fine-grained PAT: Repository access = Mobius-Substrate; Contents = Read and write; Pull requests = Read and write.',
    'Classic PAT: repo scope for that repository.',
    'Update secret: https://github.com/kaizencycle/mobius-civic-ai-terminal/settings/secrets/actions',
  ];
  return `${base}\n\n${hints.join('\n')}`;
}

function token() {
  const value =
    process.env.SUBSTRATE_GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.MOBIUS_BOT_GITHUB_TOKEN?.trim();
  if (!value) throw new Error('SUBSTRATE_GITHUB_TOKEN or GITHUB_TOKEN required');
  return value;
}

async function github(path, init = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  return res;
}

async function getBaseSha(baseBranch) {
  const res = await github(`/repos/${SUBSTRATE_REPO}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
  if (!res.ok) throw new Error(`resolve base ref ${res.status}`);
  const json = await res.json();
  return json.object.sha;
}

async function ensureBranch(branchName, fromSha) {
  const ref = `refs/heads/${branchName}`;
  const existing = await github(`/repos/${SUBSTRATE_REPO}/git/${ref}`);
  if (existing.ok) return;

  const create = await github(`/repos/${SUBSTRATE_REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref, sha: fromSha }),
  });
  if (!create.ok) {
    const body = await create.text();
    throw new Error(formatGitHubApiError(create.status, body, 'create branch'));
  }
}

async function getFileSha(branch, path) {
  const pathInUrl = path.split('/').map(encodeURIComponent).join('/');
  const res = await github(
    `/repos/${SUBSTRATE_REPO}/contents/${pathInUrl}?ref=${encodeURIComponent(branch)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get contents ${path} ${res.status}`);
  const json = await res.json();
  return json.sha ?? null;
}

async function putFile(branch, path, contentUtf8, message) {
  const sha = await getFileSha(branch, path);
  const pathInUrl = path.split('/').map(encodeURIComponent).join('/');
  const body = {
    message,
    content: Buffer.from(contentUtf8, 'utf8').toString('base64'),
    branch,
  };
  if (sha) body.sha = sha;

  const res = await github(`/repos/${SUBSTRATE_REPO}/contents/${pathInUrl}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatGitHubApiError(res.status, text, `put ${path}`));
  }
}

function intentBlock(cycle, manifest) {
  return `## EPICON Intent

\`\`\`intent
epicon_id: EPICON_${cycle}_SPECS_reserve-canon-append_v1
ledger_id: kaizencycle
scope: specs
mode: normal
issued_at: ${new Date().toISOString()}
justification:
  VALUES INVOKED: integrity, custodianship, permanence
  REASONING: Append sealed Reserve Blocks from hot KV to cold Substrate canon.
  ANCHORS:
    - Mobius-Substrate/MOBIUS_RESERVE_BLOCK_DAT.md
    - Mobius-Substrate/.github/workflows/reserve-block-canonization.yml
  BOUNDARIES: Canonizes sealed blocks as-is; excludes in-progress block.
counterfactuals:
  - If chain verification fails, do not merge until KV audit completes
\`\`\`

## Canon snapshot

- total_blocks: ${manifest.total_blocks}
- total_mic: ${manifest.total_mic}
- chain_tip_hash: \`${manifest.chain_tip_hash}\`
- generated_at: ${manifest.generated_at}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceDir = args.source;
  const manifestPath = join(sourceDir, 'MANIFEST.json');

  if (!existsSync(manifestPath)) {
    throw new Error(`MANIFEST.json not found in ${sourceDir}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (args.prime) {
    args.title = `canon(C-368): prime reserve blocks cold canon (${manifest.total_blocks} blocks)`;
  }
  const files = readdirSync(sourceDir)
    .filter((name) => name.endsWith('.dat') || name === 'MANIFEST.json')
    .sort();

  if (files.length === 0) {
    throw new Error(`No .dat or MANIFEST files in ${sourceDir}`);
  }

  const baseSha = await getBaseSha(args.base);
  await ensureBranch(args.branch, baseSha);

  for (const name of files) {
    const content = readFileSync(join(sourceDir, name), 'utf8');
    await putFile(args.branch, `canon/reserve-blocks/${name}`, content, `canon(${args.cycle}): add ${name}`);
  }

  const prBody = intentBlock(args.cycle, manifest);
  const prRes = await github(`/repos/${SUBSTRATE_REPO}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: args.title,
      head: args.branch,
      base: args.base,
      body: prBody,
      draft: true,
    }),
  });

  if (!prRes.ok) {
    const text = await prRes.text();
    throw new Error(formatGitHubApiError(prRes.status, text, 'create PR'));
  }

  const pr = await prRes.json();
  const manifestHash = createHash('sha256').update(readFileSync(manifestPath, 'utf8')).digest('hex').slice(0, 12);
  console.log(
    JSON.stringify(
      {
        ok: true,
        repo: SUBSTRATE_REPO,
        branch: args.branch,
        pr_number: pr.number,
        pr_url: pr.html_url,
        pr_title: args.title,
        files_uploaded: files.length,
        total_blocks: manifest.total_blocks,
        manifest_hash_prefix: manifestHash,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
