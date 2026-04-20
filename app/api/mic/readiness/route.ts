/**
 * GET /api/mic/readiness — MIC_READINESS_V1 (local + optional upstream KV merge) + readiness_proof hash
 * POST /api/mic/readiness — accept MIC_READINESS_V1 from tokenomics-engine; store in KV
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { resolveGiForTerminal } from '@/lib/integrity/resolveGi';
import { assembleLocalMicReadiness, getMergedMicReadiness, resolveReadinessCycle } from '@/lib/mic/assembleMicReadiness';
import { mergeMicReadinessFromUpstream } from '@/lib/mic/readinessMerge';
import type { MicReadinessResponse } from '@/lib/mic/types';
import { loadMicReadinessSnapshotRaw } from '@/lib/mic/loadReadinessSnapshot';
import { kvSet, kvLpushCapped, KV_KEYS, kvGet, KV_TTL_SECONDS } from '@/lib/kv/store';
import { scheduleKvBridgeDualWrite } from '@/lib/kv/kvBridgeClient';

export const dynamic = 'force-dynamic';

function micReadinessPostAuth(req: NextRequest): boolean {
  const agents = process.env.AGENT_SERVICE_TOKEN ?? '';
  const cron = process.env.CRON_SECRET ?? '';
  const mobius = process.env.MOBIUS_SERVICE_SECRET ?? '';
  const h = req.headers.get('authorization');
  if (agents && bearerMatchesToken(h, agents)) return true;
  if (cron && bearerMatchesToken(h, cron)) return true;
  if (mobius && bearerMatchesToken(h, mobius)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const cycleParam = req.nextUrl.searchParams.get('cycle')?.trim();
  const { raw: micSnapRaw, source: micSnapSource } = await loadMicReadinessSnapshotRaw();
  const giMeta = await resolveGiForTerminal({ micReadinessSnapshotRaw: micSnapRaw });
  const readiness = await getMergedMicReadiness(cycleParam);

  return NextResponse.json(
    {
      ...readiness,
      gi: giMeta.gi ?? readiness.gi,
      gi_resolution: {
        source: giMeta.source,
        provenance: giMeta.gi_provenance,
        verified: giMeta.verified,
        degraded: giMeta.degraded,
        age_seconds: giMeta.age_seconds,
        timestamp: giMeta.timestamp,
        mic_readiness_snapshot_source: micSnapSource,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Mobius-Source': 'mic-readiness-v1',
      },
    },
  );
}

export async function POST(req: NextRequest) {
  if (!micReadinessPostAuth(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const nested = b.snapshot && typeof b.snapshot === 'object' ? (b.snapshot as Record<string, unknown>) : null;
  const type = typeof b.type === 'string' ? b.type : nested && typeof nested.type === 'string' ? nested.type : '';
  if (type !== '' && type !== 'MIC_READINESS_V1') {
    return NextResponse.json({ ok: false, error: 'invalid_type' }, { status: 400 });
  }

  const cycle = await resolveReadinessCycle(
    typeof b.cycle === 'string' ? b.cycle : nested && typeof nested.cycle === 'string' ? nested.cycle : null,
  );
  const local = await assembleLocalMicReadiness(cycle || undefined);
  const stripMeta = (o: Record<string, unknown>) => {
    const { type: _t, received_at: _r, source: _s, snapshot: _sn, ...rest } = o;
    return rest;
  };
  const incoming = nested ? stripMeta(nested) : stripMeta(b);
  const merged = mergeMicReadinessFromUpstream(local, incoming as Partial<MicReadinessResponse>);

  const snapshot = {
    snapshot: merged,
    received_at: new Date().toISOString(),
    source: 'tokenomics-engine',
  };

  const snapStr = JSON.stringify(snapshot);
  await kvSet(KV_KEYS.MIC_READINESS_SNAPSHOT, snapStr, KV_TTL_SECONDS.MIC_READINESS_SNAPSHOT);
  scheduleKvBridgeDualWrite(
    'MIC_READINESS_SNAPSHOT',
    snapshot as unknown,
    KV_TTL_SECONDS.MIC_READINESS_SNAPSHOT,
    'mic-readiness-dual-write',
  );
  await kvLpushCapped(KV_KEYS.MIC_READINESS_FEED, snapStr, 100);

  return NextResponse.json({ ok: true, received_at: snapshot.received_at });
}
