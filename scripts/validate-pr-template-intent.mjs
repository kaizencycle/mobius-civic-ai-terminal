#!/usr/bin/env node
/**
 * Ensures PULL_REQUEST_TEMPLATE.md §3 stays compatible with kaizencycle/epicon@v1
 * Intent Publication Gate (src/validate.mjs).
 *
 * CI: epicon is checked out to .epicon-guard (see contract-tests.yml).
 * Local: EPICON_GUARD_PATH or ../epicon or .epicon-guard.
 */
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(repoRoot, '.github/PULL_REQUEST_TEMPLATE.md');
const fixturePath = join(repoRoot, 'tests/fixtures/pr-template-intent-pass.md');

function resolveEpiconValidate() {
  const candidates = [
    process.env.EPICON_GUARD_PATH,
    join(repoRoot, '.epicon-guard'),
    join(repoRoot, '..', 'epicon'),
  ].filter(Boolean);
  for (const root of candidates) {
    const p = join(root, 'src', 'validate.mjs');
    if (existsSync(p)) return p;
  }
  throw new Error(
    'EPICON Guard validator not found. In CI, contract-tests checks out kaizencycle/epicon@v1 to .epicon-guard. ' +
      'Locally: clone epicon or set EPICON_GUARD_PATH.'
  );
}

function assertTemplateShape(template) {
  if (/```text\s*\nepicon_id:/i.test(template)) {
    throw new Error('PULL_REQUEST_TEMPLATE.md still uses ```text for the intent block; use ```intent.');
  }
  if (!/```intent\s*\n[\s\S]*?epicon_id:/i.test(template)) {
    throw new Error('PULL_REQUEST_TEMPLATE.md §3 must include a ```intent fenced block with epicon_id.');
  }
  const requiredHints = [
    'ledger_id:',
    'expires_at:',
    '_v1',
    'VALUES INVOKED',
    'REASONING',
    'ANCHORS',
    'COUNTERFACTUAL',
    'counterfactuals:',
  ];
  for (const hint of requiredHints) {
    if (!template.includes(hint)) {
      throw new Error(`PULL_REQUEST_TEMPLATE.md missing required intent field hint: ${hint}`);
    }
  }
}

function extractIntentFence(md) {
  const m = md.match(/```intent\s*\n([\s\S]*?)```/);
  if (!m) throw new Error('No ```intent block found in fixture');
  return m[1].trim();
}

function runEpiconGuard(prBody, changedFiles) {
  const validateMjs = resolveEpiconValidate();
  const tmp = mkdtempSync(join(tmpdir(), 'epicon-guard-'));
  const eventPath = join(tmp, 'event.json');
  writeFileSync(
    eventPath,
    JSON.stringify({
      pull_request: {
        body: prBody,
        number: 0,
        base: { sha: '0000000000000000000000000000000000000000' },
      },
    })
  );

  const env = {
    ...process.env,
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_REPOSITORY: 'kaizencycle/mobius-civic-ai-terminal',
    INPUT_MODE: 'enforce',
    GITHUB_WORKSPACE: repoRoot,
  };

  try {
    execFileSync(process.execPath, [validateMjs], {
      env,
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (err) {
    const out = `${err.stdout || ''}\n${err.stderr || ''}`;
    if (out.includes('error::') || err.status === 1) {
      throw new Error(`EPICON Guard rejected golden intent fixture:\n${out}`);
    }
    throw err;
  }
}

const template = readFileSync(templatePath, 'utf8');
const fixture = readFileSync(fixturePath, 'utf8');

assertTemplateShape(template);

const templateIntent = extractIntentFence(template);
const fixtureIntent = extractIntentFence(fixture);

// Template placeholders use [CYCLE] etc.; golden fixture must stay byte-stable for CI.
if (!templateIntent.includes('[CYCLE]')) {
  console.warn('warn: template intent block no longer uses [CYCLE] placeholder — authors may copy a stale cycle');
}

runEpiconGuard(fixture, ['.github/PULL_REQUEST_TEMPLATE.md']);

console.log('✓ PR template shape OK; golden ```intent fixture passes EPICON Guard (warn mode structural parity)');
