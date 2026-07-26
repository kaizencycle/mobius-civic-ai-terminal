// C-384 PR-1: PR template must stay aligned with kaizencycle/epicon@v1 Intent Publication Gate.
// Run: tsx tests/contract/prTemplateIntent.test.ts

import { execSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

  it('golden fixture passes EPICON Guard validator', () => {
    const epiconGuardPath =
      process.env.EPICON_GUARD_PATH ||
      join(repoRoot, '.epicon-guard');
    execSync('node scripts/validate-pr-template-intent.mjs', {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        EPICON_GUARD_PATH: epiconGuardPath,
      },
    });
  });
});
