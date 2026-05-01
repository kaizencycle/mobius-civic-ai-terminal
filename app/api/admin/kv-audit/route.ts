/**
 * GET /api/admin/kv-audit
 *
 * Diagnostic endpoint: inspects the Redis type of all watched Mobius keys.
 * Detects WRONGTYPE mismatches (e.g. a list key being read as a string) before
 * they surface as runtime errors in the sweep or snapshot paths.
 *
 * Protected by CRON_SECRET or AGENT_SERVICE_TOKEN.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { kvType, kvTypeRaw } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

const PREFIX = 'mobius:';

// Keys written with kvSet (prefixed)
const PREFIXED_KEYS = [
  'mic:readiness:snapshot',
  'mic:readiness:feed',
  'mic:sustain:state',
  'mic:replay:pressure',
  'gi:latest',
  'gi:latest_carry',
  'signals:latest',
  'echo:state',
  'echo:kv:heartbeat',
  'tripwire:state',
  'tripwire:kv:heartbeat',
  'heartbeat:last',
  'ingest:last',
  'system:pulse',
  'operator:current_cycle',
  'vault:global:balance',
  'vault:global:meta',
  'ledger:circuit_open',
  'mic:quorum:current',
];

// Keys written with kvSetRawKey (no prefix)
const RAW_KEYS = [
  'VAULT_STATE',
  'GI_STATE',
  'MIC_READINESS_SNAPSHOT',
  'MIC_SUSTAIN_STATE',
  'TRIPWIRE_STATE',
  'ECHO_STATE',
];

function isExpectedType(key: string, type: string): boolean {
  if (type === 'none' || type === 'unavailable') return true;
  // feed key is a list (kvLpushCapped)
  if (key.includes(':feed')) return type === 'list';
  return type === 'string' || type === 'none';
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET ?? '';
  const agentToken = process.env.AGENT_SERVICE_TOKEN ?? '';
  const auth = req.headers.get('authorization');
  const authed =
    (cronSecret && bearerMatchesToken(auth, cronSecret)) ||
    (agentToken && bearerMatchesToken(auth, agentToken)) ||
    req.headers.get('x-vercel-cron') === '1';

  if (!authed) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, { type: string; ok: boolean; key_full: string }> = {};

  for (const key of PREFIXED_KEYS) {
    const type = await kvType(key);
    results[key] = {
      type,
      ok: isExpectedType(key, type),
      key_full: `${PREFIX}${key}`,
    };
  }

  for (const key of RAW_KEYS) {
    const type = await kvTypeRaw(key);
    results[key] = {
      type,
      ok: isExpectedType(key, type),
      key_full: key,
    };
  }

  const wrongTypes = Object.entries(results).filter(([, v]) => !v.ok);

  return NextResponse.json({
    ok: wrongTypes.length === 0,
    checked: Object.keys(results).length,
    wrong_type_count: wrongTypes.length,
    wrong_type_keys: wrongTypes.map(([k, v]) => ({ key: k, type: v.type })),
    keys: results,
    timestamp: new Date().toISOString(),
  });
}
