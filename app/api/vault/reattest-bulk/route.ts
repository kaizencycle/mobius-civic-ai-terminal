// C-305 FIX-510-06: Bulk reattest + quarantine audit.
// POST — clears quarantine and queues all (or specified) seals for reattest.
// GET  — full quarantine audit: counts, ages, v1 vs v2.

import { NextResponse } from 'next/server';
import { log } from '@/lib/log';
import { kvSetRawKey, kvDel, kvGetRaw, kvInspectSamples } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

const QUARANTINE_PREFIX = 'vault:quarantine:';
const PENDING_PREFIX = 'vault:pending:';
const HEARTBEAT_KEY = 'vault:heartbeat';

export async function POST(req: Request) {
  let body: { sealIds?: string[]; operatorNote?: string };
  try {
    body = (await req.json()) as { sealIds?: string[]; operatorNote?: string };
  } catch {
    body = {};
  }

  const { sealIds, operatorNote } = body;
  const ts = Date.now();
  const cycle = process.env.CURRENT_CYCLE ?? 'C-305';

  // Resolve targets: explicit list or all quarantined
  let targets: string[] = [];
  if (Array.isArray(sealIds) && sealIds.length > 0) {
    targets = sealIds.filter((id) => typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id));
  } else {
    const { keys } = await kvInspectSamples(`${QUARANTINE_PREFIX}*`, 50);
    targets = keys.map((k) => k.key.replace(QUARANTINE_PREFIX, ''));
  }

  if (!targets.length) {
    return NextResponse.json({ ok: true, message: 'No quarantined seals found', queued: [], errors: {}, cycle, ts });
  }

  const queued: string[] = [];
  const errors: Record<string, string> = {};

  for (const sealId of targets) {
    try {
      await kvDel(`${QUARANTINE_PREFIX}${sealId}`);
      await kvSetRawKey(`${PENDING_PREFIX}${sealId}`, {
        status: 'reattest_requested',
        requestedAt: ts,
        requestedBy: 'operator-bulk',
        cycle,
        operatorNote: operatorNote ?? 'bulk reattest',
      });
      queued.push(sealId);
    } catch (err) {
      errors[sealId] = err instanceof Error ? err.message : String(err);
    }
  }

  await kvSetRawKey(HEARTBEAT_KEY, { lastBulkReattest: ts, count: queued.length, cycle });
  log.info(`[reattest-bulk] queued ${queued.length} seals @ ${cycle}:`, queued);

  return NextResponse.json({ ok: true, queued, errors, cycle, ts });
}

// GET: full quarantine audit — counts, ages, v1 vs v2
export async function GET() {
  const [quarantineResult, sealResult] = await Promise.all([
    kvInspectSamples(`${QUARANTINE_PREFIX}*`, 50),
    kvInspectSamples('vault:seal:*', 50),
  ]);

  const quarantined = await Promise.all(
    quarantineResult.keys.map(async (k) => {
      const sealId = k.key.replace(QUARANTINE_PREFIX, '');
      const seal = await kvGetRaw<Record<string, unknown>>(`vault:seal:${sealId}`);
      return {
        sealId,
        schema_version: seal?.schema_version ?? 'v1',
        cycle: typeof seal?.cycle === 'string' ? seal.cycle : '—',
        status: typeof seal?.status === 'string' ? seal.status : 'quarantined',
        age_hours:
          typeof seal?.writtenAt === 'number'
            ? Math.floor((Date.now() - seal.writtenAt) / 3_600_000)
            : null,
      };
    }),
  );

  const v1Seals: string[] = [];
  for (const row of sealResult.keys) {
    const data = row.sample as Record<string, unknown> | null;
    if (data && !data.schema_version) {
      v1Seals.push(row.key.replace('vault:seal:', ''));
    }
  }

  return NextResponse.json({
    ok: true,
    quarantinedCount: quarantined.length,
    v1Count: v1Seals.length,
    quarantined,
    v1Seals,
  });
}
