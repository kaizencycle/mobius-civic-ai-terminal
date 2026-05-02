/**
 * GET /api/kv/health
 *
 * Returns Upstash Redis health status and diagnostic info.
 * Used by sentinel agents to verify KV persistence is operational.
 *
 * CC0 Public Domain
 */

import { NextResponse } from 'next/server';
import { kvHealth, isRedisAvailable, KV_KEYS, kvGet, kvGetRaw, kvExists } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await kvHealth();

  const keys: Record<string, boolean> = {};
  if (health.available) {
    for (const [name, key] of Object.entries(KV_KEYS)) {
      if (key === KV_KEYS.MIC_READINESS_FEED) {
        // Stored as a Redis list — kvGet throws WRONGTYPE; use exists check instead.
        keys[name] = await kvExists(key);
      } else {
        const val = await kvGet(key);
        keys[name] = val !== null;
      }
    }
    const legacyTripwire = await kvGetRaw<string>('TRIPWIRE_STATE');
    keys.TRIPWIRE_STATE_REDIS = legacyTripwire !== null && legacyTripwire !== undefined;
    const bal = await kvGet<number>(KV_KEYS.VAULT_GLOBAL_BALANCE);
    const meta = await kvGet<unknown>(KV_KEYS.VAULT_GLOBAL_META);
    keys.VAULT_STATE = bal !== null || meta !== null;
  }

  return NextResponse.json({
    ok: health.available,
    ...health,
    keys,
    perplexity: Boolean(process.env.PERPLEXITY_API_KEY),
    timestamp: new Date().toISOString(),
  }, {
    headers: {
      'X-Mobius-Source': 'kv-health',
    },
  });
}
