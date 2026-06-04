#!/usr/bin/env node
// scripts/verify-canon.mjs
// C-326 / OPT-20 Layer 2: vendored canon == upstream Substrate canon.
//
// Fetches Mobius-Substrate/configs/kaizen_shards.yaml from GitHub,
// computes its sha256, and compares against:
//   (a) the vendored copy in lib/integrity/canon/kaizen_shards.yaml
//   (b) the pinned checksum in lib/integrity/canon/kaizen_shards.sha256
//
// If either check fails, exits non-zero — the build is red until someone runs:
//   node scripts/verify-canon.mjs --refresh
// which re-vendors the upstream copy and updates the pinned checksum.
//
// Requires: GITHUB_TOKEN env var (default token in Actions is sufficient
// for public repos; swap in a PAT with read scope if Substrate goes private).

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CANON_PATH = join(ROOT, 'lib', 'integrity', 'canon', 'kaizen_shards.yaml');
const HASH_PATH = join(ROOT, 'lib', 'integrity', 'canon', 'kaizen_shards.sha256');

const UPSTREAM_URL =
  'https://raw.githubusercontent.com/kaizencycle/Mobius-Substrate/main/configs/kaizen_shards.yaml';

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

const isRefresh = process.argv.includes('--refresh');

async function main() {
  console.log('Layer 2: verifying vendored canon against upstream Substrate…');

  // Fetch upstream
  const headers = { Accept: 'application/vnd.github.raw+json' };
  if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;

  let upstreamText;
  try {
    const res = await fetch(UPSTREAM_URL, { headers });
    if (!res.ok) {
      console.error(`❌ fetch failed: ${res.status} ${res.statusText}`);
      console.error(`   URL: ${UPSTREAM_URL}`);
      console.error('   If Substrate is private, set SUBSTRATE_CANON_URL + GITHUB_TOKEN with read scope.');
      process.exit(1);
    }
    upstreamText = await res.text();
  } catch (err) {
    console.error(`❌ network error fetching upstream canon: ${err.message}`);
    process.exit(1);
  }

  const upstreamHash = sha256(upstreamText);
  console.log(`   upstream sha256: ${upstreamHash}`);

  if (isRefresh) {
    writeFileSync(CANON_PATH, upstreamText, 'utf8');
    writeFileSync(HASH_PATH, upstreamHash + '\n', 'utf8');
    console.log('✅ refreshed: vendored copy and pinned hash updated.');
    return;
  }

  // Check vendored copy matches pinned hash
  const vendoredText = readFileSync(CANON_PATH, 'utf8');
  const vendoredHash = sha256(vendoredText);
  const pinnedHash = readFileSync(HASH_PATH, 'utf8').trim();

  if (vendoredHash !== pinnedHash) {
    console.error(`❌ vendored canon does not match pinned checksum.`);
    console.error(`   vendored: ${vendoredHash}`);
    console.error(`   pinned:   ${pinnedHash}`);
    console.error('   Run: node scripts/verify-canon.mjs --refresh');
    process.exit(1);
  }

  if (upstreamHash !== pinnedHash) {
    console.error(`❌ upstream Substrate canon has changed since last vendor.`);
    console.error(`   upstream: ${upstreamHash}`);
    console.error(`   pinned:   ${pinnedHash}`);
    console.error('   Review the upstream diff, then run: node scripts/verify-canon.mjs --refresh');
    process.exit(1);
  }

  console.log(`✅ vendored == pinned == upstream (${upstreamHash.slice(0, 16)}…)`);
}

main();
