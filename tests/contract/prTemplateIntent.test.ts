// C-384 PR-1: PR template must stay aligned with pinned EPICON Guard (epicon v1.1 SHA).

import { execSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EPICON_GUARD_REF,
  assertTemplateSchemaAlignsWithFixture,
  extractIntentFence,
  renderTemplateIntentForValidation,
  runEpiconGuard,
  runRegressionSelfChecks,
} from '../../scripts/lib/pr-template-intent-guard.mjs';

const repoRoot = join(import.meta.dirname, '../..');

describe('PR template EPICON intent publication', () => {
  it('template uses ```intent fence and required I6 field hints', () => {
    const template = readFileSync(join(repoRoot, '.github/PULL_REQUEST_TEMPLATE.md'), 'utf8');
    assert.match(template, /```intent\s*\n[\s\S]*?epicon_id:/);
    assert.doesNotMatch(template, /```text\s*\nepicon_id:/i);
    assert.ok(template.includes('ledger_id:'));
    assert.ok(template.includes('expires_at:'));
    assert.ok(template.includes('counterfactuals:'));
  });

  it('template justification schema matches golden fixture (parsed keys)', () => {
    const templateIntent = extractIntentFence(
      readFileSync(join(repoRoot, '.github/PULL_REQUEST_TEMPLATE.md'), 'utf8')
    );
    const fixtureIntent = extractIntentFence(
      readFileSync(join(repoRoot, 'tests/fixtures/pr-template-intent-pass.md'), 'utf8')
    );
    assertTemplateSchemaAlignsWithFixture(templateIntent, fixtureIntent);
  });

  it('regression: invalid template materializations fail Guard', () => {
    const epiconGuardPath = process.env.EPICON_GUARD_PATH || join(repoRoot, '.epicon-guard');
    const prev = process.env.EPICON_GUARD_PATH;
    process.env.EPICON_GUARD_PATH = epiconGuardPath;
    try {
      const templateIntent = extractIntentFence(
        readFileSync(join(repoRoot, '.github/PULL_REQUEST_TEMPLATE.md'), 'utf8')
      );
      runRegressionSelfChecks(() => templateIntent);
    } finally {
      if (prev === undefined) delete process.env.EPICON_GUARD_PATH;
      else process.env.EPICON_GUARD_PATH = prev;
    }
  });

  it('golden fixture and rendered template intent pass EPICON Guard validator', () => {
    const epiconGuardPath = process.env.EPICON_GUARD_PATH || join(repoRoot, '.epicon-guard');
    execSync('node scripts/validate-pr-template-intent.mjs', {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        EPICON_GUARD_PATH: epiconGuardPath,
      },
    });
  });

  it('CI pins immutable EPICON_GUARD_REF in guard module', () => {
    assert.match(EPICON_GUARD_REF, /^[0-9a-f]{40}$/);
    for (const workflow of ['contract-tests.yml', 'gi-gate.yml', 'epicon-guard.yml']) {
      const text = readFileSync(join(repoRoot, '.github/workflows', workflow), 'utf8');
      assert.ok(text.includes(EPICON_GUARD_REF), `${workflow} must pin epicon@${EPICON_GUARD_REF.slice(0, 7)}`);
    }
  });
});
