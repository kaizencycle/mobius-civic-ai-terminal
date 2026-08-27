#!/usr/bin/env node
/**
 * EPICON Guard parity checks for .github/PULL_REQUEST_TEMPLATE.md §3.
 * Pins to the same validate.mjs revision as CI (see EPICON_GUARD_REF).
 */
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

/** Immutable — kaizencycle/epicon v1.1 (do not use floating @v1). */
export const EPICON_GUARD_REF = '8af925208733aaf9668aaedc15bf2a65aab47f21';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// issued_at/expires_at are computed relative to run time, not hardcoded: a fixed
// historical window inevitably expires and fails this self-check on every PR from
// that date on (found via C-416 governance review, PR #702's "contract" check
// failing on unmodified main — the 2026-07-26 -> 2026-08-26 window had lapsed).
const RENDER_NOW = new Date();
const RENDER_EXPIRES = new Date(RENDER_NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
const RENDER = {
  cycle: '384',
  scope: 'ci',
  slug: 'template-schema-check',
  issued_at: RENDER_NOW.toISOString(),
  expires_at: RENDER_EXPIRES.toISOString(),
};

const PLACEHOLDER_EPIcon_ID =
  /^epicon_id: EPICON_C-\[CYCLE\]_\[scope\]_\[short-slug\]_v1\s*$/m;
const PLACEHOLDER_SCOPE =
  /^scope: \[docs\|ci\|core\|infra\|sentinels\|labs\|specs\]\s*$/m;
const PLACEHOLDER_ISSUED = /^issued_at: \[ISO-8601 UTC\]\s*$/m;
const PLACEHOLDER_EXPIRES = /^expires_at: \[ISO-8601 UTC, after issued_at\]\s*$/m;

const REQUIRED_JUSTIFICATION_KEYS = [
  'VALUES INVOKED',
  'REASONING',
  'ANCHORS',
  'BOUNDARIES',
  'COUNTERFACTUAL',
];

const VALID_SCOPES = new Set(['docs', 'ci', 'core', 'infra', 'sentinels', 'labs', 'specs']);

export function resolveEpiconValidate() {
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
    `EPICON Guard validator not found. CI checks out epicon@${EPICON_GUARD_REF.slice(0, 7)} to .epicon-guard.`
  );
}

export function extractIntentFence(md) {
  const m = md.match(/```intent\s*\n([\s\S]*?)```/);
  if (!m) throw new Error('No ```intent block found');
  return m[1].trim();
}

/**
 * Materialize §3 for validation: only the four documented header placeholders
 * are substituted. Any other edit (e.g. scope: epicon) is left intact so Guard fails.
 * Remaining [bracket] hints on justification lines become prose.
 */
export function renderTemplateIntentForValidation(raw) {
  if (!PLACEHOLDER_EPIcon_ID.test(raw)) {
    throw new Error('Template epicon_id line must match EPICON_C-[CYCLE]_[scope]_[short-slug]_v1');
  }
  if (!PLACEHOLDER_SCOPE.test(raw)) {
    throw new Error(
      'Template scope line must be the validator enum placeholder ' +
        '[docs|ci|core|infra|sentinels|labs|specs] — literal scopes belong in filled PRs only.'
    );
  }
  if (!PLACEHOLDER_ISSUED.test(raw) || !PLACEHOLDER_EXPIRES.test(raw)) {
    throw new Error('Template issued_at / expires_at must use the documented ISO placeholders.');
  }

  let s = raw;
  s = s.replace(
    PLACEHOLDER_EPIcon_ID,
    `epicon_id: EPICON_C-${RENDER.cycle}_${RENDER.scope}_${RENDER.slug}_v1`
  );
  s = s.replace(PLACEHOLDER_SCOPE, `scope: ${RENDER.scope}`);
  s = s.replace(PLACEHOLDER_ISSUED, `issued_at: ${RENDER.issued_at}`);
  s = s.replace(PLACEHOLDER_EXPIRES, `expires_at: ${RENDER.expires_at}`);
  s = s.replace(/\[[^\]]+\]/g, 'documented-placeholder-replaced-for-ci');

  if (/\[[^\]]+\]/.test(s)) {
    throw new Error('Unresolved bracket placeholders after render — update §3 or renderTemplateIntentForValidation.');
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

export function assertTemplateSchemaAlignsWithFixture(templateIntent, fixtureIntent) {
  for (const key of REQUIRED_JUSTIFICATION_KEYS) {
    if (!justificationKeys(templateIntent).has(key)) {
      throw new Error(`Template intent missing justification key "${key}".`);
    }
    if (!justificationKeys(fixtureIntent).has(key)) {
      throw new Error(`Golden fixture missing justification key "${key}".`);
    }
  }
}

/**
 * Run epicon validate.mjs; fail on any ::error:: annotation (including PASS_WITH_BACKFILL).
 */
export function runEpiconGuard(intentBody, label) {
  const validateMjs = resolveEpiconValidate();
  const tmp = mkdtempSync(join(tmpdir(), 'epicon-guard-'));
  const eventPath = join(tmp, 'event.json');
  const body = intentBody.includes('```intent')
    ? intentBody
    : `\`\`\`intent\n${intentBody}\n\`\`\``;

  writeFileSync(
    eventPath,
    JSON.stringify({
      pull_request: {
        body,
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

  let combined = '';
  let status = 0;
  try {
    combined = execFileSync(process.execPath, [validateMjs], {
      env,
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    status = err.status ?? 1;
    combined = `${err.stdout || ''}\n${err.stderr || ''}`;
  }

  const errorAnnotations = (combined.match(/::error::/g) || []).length;
  if (errorAnnotations > 0 || status !== 0) {
    throw new Error(
      `EPICON Guard rejected ${label} (${errorAnnotations} error annotation(s), exit ${status}):\n${combined}`
    );
  }
}

export function runRegressionSelfChecks(getTemplateIntent) {
  const base = getTemplateIntent();

  const badScope = base.replace(PLACEHOLDER_SCOPE, 'scope: epicon');
  let threw = false;
  try {
    runEpiconGuard(renderTemplateIntentForValidation(badScope), 'regression: scope epicon');
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error('Regression self-check failed: scope: epicon must be rejected by Guard');
  }

  const noBoundaries = base
    .split('\n')
    .filter((l) => !/^  BOUNDARIES:/.test(l))
    .join('\n');
  threw = false;
  try {
    runEpiconGuard(renderTemplateIntentForValidation(noBoundaries), 'regression: missing BOUNDARIES');
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error('Regression self-check failed: missing BOUNDARIES must be rejected by Guard');
  }
}

function assertTemplateShape(template, templateIntent) {
  if (/```text\s*\nepicon_id:/i.test(template)) {
    throw new Error('PULL_REQUEST_TEMPLATE.md still uses ```text for the intent block; use ```intent.');
  }
  if (!/```intent\s*\n[\s\S]*?epicon_id:/i.test(template)) {
    throw new Error('PULL_REQUEST_TEMPLATE.md §3 must include a ```intent fenced block with epicon_id.');
  }
  const scopeLine = templateIntent.match(/^scope:\s*(.+)$/m)?.[1]?.trim();
  if (scopeLine && !scopeLine.startsWith('[') && !VALID_SCOPES.has(scopeLine)) {
    throw new Error(`Template intent has invalid literal scope "${scopeLine}" — use the enum placeholder line.`);
  }
}

export function runPrTemplateIntentGuard() {
  const templatePath = join(repoRoot, '.github/PULL_REQUEST_TEMPLATE.md');
  const fixturePath = join(repoRoot, 'tests/fixtures/pr-template-intent-pass.md');

  const template = readFileSync(templatePath, 'utf8');
  const fixture = readFileSync(fixturePath, 'utf8');
  const templateIntent = extractIntentFence(template);
  const fixtureIntent = extractIntentFence(fixture);

  assertTemplateShape(template, templateIntent);
  assertTemplateSchemaAlignsWithFixture(templateIntent, fixtureIntent);

  const rendered = renderTemplateIntentForValidation(templateIntent);
  runEpiconGuard(fixtureIntent, 'golden fixture');
  runEpiconGuard(rendered, 'rendered §3 template intent');

  runRegressionSelfChecks(() => templateIntent);

  console.log(
    `✓ PR template + golden fixture pass EPICON Guard (pinned ${EPICON_GUARD_REF.slice(0, 7)})`
  );
}
