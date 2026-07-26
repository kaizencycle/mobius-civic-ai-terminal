#!/usr/bin/env node
/**
 * Ensures PULL_REQUEST_TEMPLATE.md §3 stays compatible with kaizencycle/epicon@v1
 * Intent Publication Gate (src/validate.mjs).
 *
 * Validates (1) the golden fixture and (2) the template intent block after
 * substituting documented placeholders — so a broken template cannot stay green
 * while only the fixture passes.
 *
 * CI: epicon is checked out to .epicon-guard (contract-tests.yml, gi-gate.yml).
 */
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(repoRoot, '.github/PULL_REQUEST_TEMPLATE.md');
const fixturePath = join(repoRoot, 'tests/fixtures/pr-template-intent-pass.md');

const RENDER = {
  cycle: '384',
  scope: 'ci',
  slug: 'template-schema-check',
  issued_at: '2026-07-26T15:00:00Z',
  expires_at: '2026-08-26T15:00:00Z',
};

const REQUIRED_JUSTIFICATION_KEYS = [
  'VALUES INVOKED',
  'REASONING',
  'ANCHORS',
  'BOUNDARIES',
  'COUNTERFACTUAL',
];

const REQUIRED_TOP_LEVEL = [
  'epicon_id',
  'ledger_id',
  'scope',
  'mode',
  'issued_at',
  'expires_at',
  'justification',
  'counterfactuals',
];

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
    'EPICON Guard validator not found. In CI, workflows check out kaizencycle/epicon@v1 to .epicon-guard. ' +
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
  if (!m) throw new Error('No ```intent block found');
  return m[1].trim();
}

/**
 * Substitute §3 bracket placeholders with values that satisfy EPICON Guard v1.
 * Keep in sync with .github/PULL_REQUEST_TEMPLATE.md §3 placeholder text.
 */
function renderTemplateIntentForValidation(raw) {
  let s = raw;
  s = s.replace(
    /^epicon_id: EPICON_C-\[CYCLE\]_\[scope\]_\[short-slug\]_v1\s*$/m,
    `epicon_id: EPICON_C-${RENDER.cycle}_${RENDER.scope}_${RENDER.slug}_v1`
  );
  s = s.replace(
    /^scope: \[docs\|ci\|core\|infra\|sentinels\|labs\|specs\]\s*$/m,
    `scope: ${RENDER.scope}`
  );
  s = s.replace(/^issued_at: \[ISO-8601 UTC\]\s*$/m, `issued_at: ${RENDER.issued_at}`);
  s = s.replace(
    /^expires_at: \[ISO-8601 UTC, after issued_at\]\s*$/m,
    `expires_at: ${RENDER.expires_at}`
  );
  s = s.replace(
    /^  VALUES INVOKED: \[[^\]]+\]\s*$/m,
    '  VALUES INVOKED: Metric Humility; rendered template must pass Intent Publication Gate.'
  );
  s = s.replace(
    /^  REASONING: \[[^\]]+\]\s*$/m,
    '  REASONING: CI renders documented placeholders and runs the same validator authors must satisfy.'
  );
  s = s.replace(
    /^    - \[path or doc[^\]]*\]\s*$/gm,
    '    - .github/PULL_REQUEST_TEMPLATE.md'
  );
  // Second anchor line was identical placeholder text — ensure two distinct anchors
  const anchorLines = s.split('\n').filter((l) => l.trim().startsWith('- .github/PULL_REQUEST_TEMPLATE.md'));
  if (anchorLines.length >= 2) {
    s = s.replace(
      '    - .github/PULL_REQUEST_TEMPLATE.md\n    - .github/PULL_REQUEST_TEMPLATE.md',
      '    - .github/PULL_REQUEST_TEMPLATE.md\n    - tests/fixtures/pr-template-intent-pass.md'
    );
  }
  s = s.replace(
    /^  BOUNDARIES: \[[^\]]+\]\s*$/m,
    '  BOUNDARIES: Schema validation only; does not change runtime behavior.'
  );
  s = s.replace(
    /^  COUNTERFACTUAL: \[[^\]]+\]\s*$/m,
    '  COUNTERFACTUAL: If rendered template intent fails, every PR following the template will fail the gate.'
  );
  s = s.replace(
    /^  - If \[condition\], then \[corrective action\]\s*$/gm,
    '  - If validation fails after a template edit, update §3 placeholders and this render map together.'
  );
  // Ensure two distinct counterfactual bullets
  s = s.replace(
    /(counterfactuals:\n)(  - If validation fails[^\n]+\n)(  - If validation fails[^\n]+)/,
    '$1$2  - If expires_at would be in the past, refresh issued_at and expires_at before merge.\n'
  );

  const unresolved = s.match(/\[(?:CYCLE|condition|ISO-8601|path or doc|docs\|ci)[^\]]*\]/gi);
  if (unresolved?.length) {
    throw new Error(
      `Template intent has unresolved placeholders after render: ${unresolved.join(', ')}. ` +
        'Update renderTemplateIntentForValidation() when §3 placeholders change.'
    );
  }
  return s;
}

function justificationKeys(intentRaw) {
  const keys = new Set();
  let section = null;
  for (const line of intentRaw.split('\n')) {
    const trimmed = line.trim();
    if (/^justification\s*:/i.test(trimmed)) {
      section = 'justification';
      continue;
    }
    if (/^counterfactuals\s*:/i.test(trimmed)) {
      section = null;
      continue;
    }
    if (section === 'justification') {
      const m = trimmed.match(/^([A-Z][A-Z ]+?)\s*:/);
      if (m) keys.add(m[1].trim());
    }
  }
  return keys;
}

function assertTemplateSchemaAlignsWithFixture(templateIntent, fixtureIntent) {
  for (const key of REQUIRED_JUSTIFICATION_KEYS) {
    if (!templateIntent.includes(key)) {
      throw new Error(`Template intent missing justification key "${key}" (fixture has it).`);
    }
  }
  const templateKeys = justificationKeys(templateIntent);
  const fixtureKeys = justificationKeys(fixtureIntent);
  for (const key of REQUIRED_JUSTIFICATION_KEYS) {
    if (!fixtureKeys.has(key)) {
      throw new Error(`Golden fixture missing justification key "${key}" — refresh fixture.`);
    }
    if (!templateKeys.has(key)) {
      throw new Error(`Template missing justification key "${key}" present in golden fixture.`);
    }
  }
  for (const field of REQUIRED_TOP_LEVEL) {
    const re = new RegExp(`^${field}\\s*:`, 'm');
    if (!re.test(templateIntent)) {
      throw new Error(`Template intent missing top-level field "${field}:"`);
    }
    if (!re.test(fixtureIntent)) {
      throw new Error(`Golden fixture missing top-level field "${field}:"`);
    }
  }
}

function runEpiconGuard(prBody, label) {
  const validateMjs = resolveEpiconValidate();
  const tmp = mkdtempSync(join(tmpdir(), 'epicon-guard-'));
  const eventPath = join(tmp, 'event.json');
  writeFileSync(
    eventPath,
    JSON.stringify({
      pull_request: {
        body: prBody.includes('```intent') ? prBody : `\`\`\`intent\n${prBody}\n\`\`\``,
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
      throw new Error(`EPICON Guard rejected ${label}:\n${out}`);
    }
    throw err;
  }
}

const template = readFileSync(templatePath, 'utf8');
const fixture = readFileSync(fixturePath, 'utf8');

assertTemplateShape(template);

const templateIntent = extractIntentFence(template);
const fixtureIntent = extractIntentFence(fixture);

if (!templateIntent.includes('[CYCLE]')) {
  console.warn('warn: template intent block no longer uses [CYCLE] placeholder — update renderTemplateIntentForValidation');
}

assertTemplateSchemaAlignsWithFixture(templateIntent, fixtureIntent);

const renderedTemplateIntent = renderTemplateIntentForValidation(templateIntent);

runEpiconGuard(fixture, 'golden fixture');
runEpiconGuard(renderedTemplateIntent, 'rendered template intent (§3 placeholders filled)');

console.log(
  '✓ PR template shape OK; golden fixture and rendered §3 template intent pass EPICON Guard v1'
);
