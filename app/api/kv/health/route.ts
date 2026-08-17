/**
 * GET /api/kv/health
 *
 * Returns Upstash Redis health status and diagnostic info.
 * Used by sentinel agents to verify KV persistence is operational.
 *
 * C-406: kv_keys_ok now reflects continuity (seed-minimum) keys only.
 * kv_keys_all_ok retains full diagnostic enumeration semantics.
 *
 * CC0 Public Domain
 */

import { NextResponse } from 'next/server';
import { kvHealth } from '@/lib/kv/store';
import { assessKvKeyHealth } from '@/lib/kv/kvKeyHealth';
import { getBackupRedisHealth } from '@/lib/kv/backup-redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await kvHealth();
  const keyReport = health.available ? await assessKvKeyHealth() : null;
  const backup_redis = await getBackupRedisHealth();

  return NextResponse.json(
    {
      ok: health.available,
      ...health,
      backup_redis,
      kv_continuity_ok: keyReport?.kv_continuity_ok ?? null,
      kv_diagnostic_ok: keyReport?.kv_diagnostic_ok ?? null,
      kv_keys_ok: keyReport?.kv_keys_ok ?? null,
      kv_keys_all_ok: keyReport?.kv_keys_all_ok ?? null,
      continuity_present: keyReport?.continuity_present ?? null,
      continuity_required: keyReport?.continuity_required ?? null,
      diagnostic_present: keyReport?.diagnostic_present ?? null,
      diagnostic_required: keyReport?.diagnostic_required ?? null,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Mobius-Source': 'kv-health',
      },
    },
  );
}
