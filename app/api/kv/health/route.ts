/**
 * GET /api/kv/health
 *
 * Returns Upstash Redis health status and diagnostic info.
 * Used by sentinel agents to verify KV persistence is operational.
 *
 * CC0 Public Domain
 */

import { NextResponse } from 'next/server';
import { kvHealth, isRedisAvailable, KV_KEYS, kvGet, kvGetRaw } from '@/lib/kv/store';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import { currentCycleId } from '@/lib/eve/cycle-engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await kvHealth();

  // Check what keys are populated
  const keys: Record<string, boolean> = {};
  if (health.available) {
    for (const [name, key] of Object.entries(KV_KEYS)) {
      const val = await kvGet(key);
      keys[name] = val !== null;
    }
    const legacyTripwire = await kvGetRaw<string>('TRIPWIRE_STATE');
    keys.TRIPWIRE_STATE_REDIS = legacyTripwire !== null && legacyTripwire !== undefined;
  }

  const populatedCount = Object.values(keys).filter(Boolean).length;
  const totalChecked = Object.keys(keys).length;

  if (health.available) {
    void pushLedgerEntry({
      id: `kv-health-${currentCycleId()}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      author: 'DAEDALUS',
      title: `KV health: ${populatedCount}/${totalChecked} keys populated, latency ${health.latencyMs ?? '?'}ms`,
      type: 'epicon',
      severity: populatedCount < totalChecked / 2 ? 'elevated' : 'nominal',
      source: 'kv-ledger',
      tags: ['kv-health', 'infrastructure', currentCycleId()],
      verified: false,
      category: 'heartbeat',
      status: 'committed',
      agentOrigin: 'DAEDALUS',
    }).catch(() => {});
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
