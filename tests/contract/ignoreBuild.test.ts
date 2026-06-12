// C-339 PR-C item 5 (acceptance): regression test for scripts/ignore-build.sh,
// the Vercel ignoreCommand that decides skip (exit 0) vs build (exit 1).
//
// Item 5 ("add a deploy-skip rule so canon-state/journal commits never trigger
// deploys") was ALREADY implemented (C-305/C-314/C-335). This test locks that
// behavior so the freeze that stuck dpl_G6vR — and the inverse, a real deploy
// being silently skipped — can't regress unnoticed.
//
// The script is driven purely by VERCEL_GIT_* env here; it runs in a non-git
// temp dir so the git-log/git-diff fallbacks never depend on repo state.
//
// Run: tsx tests/contract/ignoreBuild.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(fileURLToPath(new URL('../../', import.meta.url)), 'scripts', 'ignore-build.sh');
const CWD = mkdtempSync(join(tmpdir(), 'ignore-build-'));

type GitEnv = {
  subject?: string;
  email?: string;
  name?: string;
  login?: string;
  ref?: string;
};

// Returns 0 (skip) or 1 (build).
function run(g: GitEnv): number {
  const env = {
    ...process.env,
    VERCEL_GIT_COMMIT_MESSAGE: g.subject ?? 'feat: ordinary change',
    VERCEL_GIT_COMMIT_AUTHOR_EMAIL: g.email ?? 'dev@example.com',
    VERCEL_GIT_COMMIT_AUTHOR_NAME: g.name ?? 'Dev',
    VERCEL_GIT_COMMIT_AUTHOR_LOGIN: g.login ?? 'dev',
    VERCEL_GIT_COMMIT_REF: g.ref ?? 'main',
  };
  try {
    execFileSync('bash', [SCRIPT], { env, cwd: CWD, stdio: 'pipe' });
    return 0; // exit 0 = skip
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 1) return 1; // exit 1 = build
    throw err;
  }
}

const SKIP = 0;
const BUILD = 1;

describe('ignore-build.sh: skip vs build decision', () => {
  it('skips bot/sentinel commits (bot@mobius.systems)', () => {
    assert.strictEqual(run({ email: 'bot@mobius.systems' }), SKIP);
  });

  it('skips github-actions[bot] by login', () => {
    assert.strictEqual(run({ login: 'github-actions[bot]', email: 'x@y.z' }), SKIP);
  });

  it('skips cursor/* agent branches', () => {
    assert.strictEqual(run({ ref: 'cursor/some-work' }), SKIP);
  });

  it('skips [skip ci] commits', () => {
    assert.strictEqual(run({ subject: 'chore: tweak [skip ci]' }), SKIP);
  });

  it('skips the mesh cycle-state refresh commit', () => {
    assert.strictEqual(run({ subject: 'chore(mesh): refresh cycle state from snapshot-lite', email: 'bot@mobius.systems' }), SKIP);
  });

  it('builds ordinary human commits on main', () => {
    assert.strictEqual(run({ subject: 'feat: add panel', email: 'dev@example.com', login: 'dev' }), BUILD);
  });

  it('builds operator-authored commits (kaizencycle)', () => {
    assert.strictEqual(run({ login: 'kaizencycle', email: 'kaizencycle@users.noreply.github.com' }), BUILD);
  });

  it('honors an explicit [deploy] directive from a human', () => {
    assert.strictEqual(run({ subject: 'fix: urgent [deploy]', email: 'dev@example.com', login: 'dev' }), BUILD);
  });

  it('skips claude/* branches without a [deploy] tag', () => {
    assert.strictEqual(run({ ref: 'claude/agent-work', subject: 'chore: agent' }), SKIP);
  });
});
