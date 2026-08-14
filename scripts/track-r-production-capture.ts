#!/usr/bin/env tsx
/**
 * Gated Track R production capture (Option A).
 *
 * 1. Verify production KV identity anchors
 * 2. Optionally publish affected-block snapshot to primary KV (Option B bootstrap)
 * 3. Run track-r-live-dry-run-package with authenticated primary reads
 *
 * Requires production Upstash credentials in env or .env.local:
 *   KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_* aliases)
 *
 * Usage:
 *   pnpm track-r:production-capture
 *   pnpm track-r:production-capture --skip-write-affected-blocks
 *   pnpm track-r:production-capture --base-url https://mobius-civic-ai-terminal.vercel.app
 */

import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { resolveExportCycle } from '@/lib/dat/resolveExportCycle';
import { hasUpstashKvCredentials } from '@/lib/kv/upstashEnv';
import { verifyProductionKvEnvironmentIdentity } from '@/lib/watchdog/batchRepair/kvEnvironmentIdentity';
import { refreshCollisionAffectedBlockSnapshotFromPrimaryKv } from '@/lib/vault/collision-affected-blocks-store';

config({ path: '.env.local' });

async function main(): Promise<void> {
  const skipWrite = process.argv.includes('--skip-write-affected-blocks');
  const baseUrlIndex = process.argv.indexOf('--base-url');
  const packageArgs =
    baseUrlIndex >= 0 && process.argv[baseUrlIndex + 1]
      ? ['--base-url', process.argv[baseUrlIndex + 1]]
      : [];

  if (!hasUpstashKvCredentials()) {
    console.error('BLOCKED: authenticated KV credentials unavailable');
    console.error('Set KV_REST_API_URL and KV_REST_API_TOKEN (production Upstash).');
    process.exit(1);
  }

  console.log('Verifying production KV identity anchors…');
  const identity = await verifyProductionKvEnvironmentIdentity();
  if (!identity.ok) {
    console.error('Executive status: BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH');
    for (const error of identity.errors) {
      console.error(`  ${error}`);
    }
    process.exit(1);
  }
  console.log('KV identity OK');

  if (!skipWrite) {
    console.log('Publishing affected-block snapshot to primary KV…');
    const refresh = await refreshCollisionAffectedBlockSnapshotFromPrimaryKv({
      operator_cycle: resolveExportCycle(),
    });
    if (!refresh.written || !refresh.snapshot) {
      console.error('Failed to publish affected-block snapshot:');
      for (const error of refresh.errors) {
        console.error(`  ${error}`);
      }
      process.exit(1);
    }
    console.log(
      `Affected-block snapshot written (${refresh.snapshot.affected_block_numbers.length} blocks, ` +
        `${refresh.seal_count} primary seal bodies scanned)`,
    );
  }

  console.log('Running Track R live dry-run evidence package…');
  const result = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['track-r:live-dry-run-package', ...packageArgs],
    {
      stdio: 'inherit',
      env: process.env,
    },
  );

  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
