#!/usr/bin/env node
/**
 * Create empty journals/{agent}/.gitkeep in kaizencycle/Mobius-Substrate via GitHub Contents API.
 * Requires: SUBSTRATE_GITHUB_TOKEN (fine-grained PAT, Contents read+write on that repo only).
 *
 * Usage: node scripts/scaffold-substrate-journal-dirs.mjs
 */
const SUBSTRATE_REPO = 'kaizencycle/Mobius-Substrate';
const API = 'https://api.github.com';
const AGENTS = ['atlas', 'zeus', 'eve', 'hermes', 'aurea', 'jade', 'daedalus', 'echo'];

const token = process.env.SUBSTRATE_GITHUB_TOKEN;
if (!token) {
  console.error('SUBSTRATE_GITHUB_TOKEN is not set');
  process.exit(1);
}

const emptyB64 = Buffer.from('').toString('base64');

async function putGitkeep(agent) {
  const path = `journals/${agent}/.gitkeep`;
  const url = `${API}/repos/${SUBSTRATE_REPO}/contents/${path}`;
  const head = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (head.ok) {
    console.log(`skip ${path} (exists)`);
    return;
  }
  if (head.status !== 404) {
    const t = await head.text();
    throw new Error(`HEAD ${path} ${head.status}: ${t}`);
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message: `chore: scaffold ${agent} journal dir [skip ci]`,
      content: emptyB64,
      committer: { name: 'Mobius Terminal', email: 'terminal@mobius.systems' },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PUT ${path} ${res.status}: ${err}`);
  }
  console.log(`created ${path}`);
}

async function main() {
  for (const agent of AGENTS) {
    await putGitkeep(agent);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
