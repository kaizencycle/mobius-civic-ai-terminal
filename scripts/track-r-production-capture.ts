#!/usr/bin/env tsx
/**
 * ATLAS × ZEUS — Production KV witness capture (read-only).
 *
 * Proves production datastore identity, derives live collision set, exports
 * complete witness universe, and emits a fail-closed attestation packet.
 *
 * Production KV writes: FORBIDDEN
 * Track R execution: NOT AUTHORIZED
 *
 * Requires production Upstash credentials via approved secret store only:
 *   KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_* aliases)
 *
 * Usage:
 *   pnpm track-r:production-capture
 *   pnpm track-r:production-capture --base-url https://mobius-civic-ai-terminal.vercel.app
 */

import { config } from 'dotenv';

config({ path: '.env.local' });

import { hasUpstashKvCredentials } from '@/lib/kv/upstashEnv';

async function main(): Promise<void> {
  if (!hasUpstashKvCredentials()) {
    console.error('Executive status: BLOCKED_PRODUCTION_KV_CREDENTIALS_NOT_CONFIGURED');
    console.error('Required environment variables (values not shown):');
    console.error('  KV_REST_API_URL or UPSTASH_REDIS_REST_URL');
    console.error('  KV_REST_API_TOKEN or UPSTASH_REDIS_REST_TOKEN');
    console.error('Configure via GitHub Actions secrets, Vercel env, or local .env.local.');
    process.exit(1);
  }

  const baseUrlIndex = process.argv.indexOf('--base-url');
  const packageArgs =
    baseUrlIndex >= 0 && process.argv[baseUrlIndex + 1]
      ? ['--base-url', process.argv[baseUrlIndex + 1], '--production-capture']
      : ['--production-capture'];

  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['track-r:live-dry-run-package', ...packageArgs],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        TRACK_R_CAPTURE_MODE: 'production_witness_read_only',
      },
    },
  );

  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
