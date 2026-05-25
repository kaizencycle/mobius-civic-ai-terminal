// C-305 FIX-510-01: v1→v2 seal migration endpoint.
// Upgrades legacy v1 seals (flat `hash` field, no schema_version) to v2 schema
// then re-submits to substrate. Also lists remaining v1 seals via GET.

import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { kvGetRaw, kvSetRawKey, kvDel, kvInspectSamples } from '@/lib/kv/store';
import { TERMINAL_REGISTRATION } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

interface V1Seal {
  hash: string;
  cycle?: string;
  createdAt?: number;
  writtenAt?: number;
  [key: string]: unknown;
}

export async function POST(req: Request) {
  let body: { sealId?: string; operatorNote?: string };
  try {
    body = (await req.json()) as { sealId?: string; operatorNote?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const { sealId, operatorNote } = body;
  if (!sealId || typeof sealId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(sealId)) {
    return NextResponse.json({ ok: false, error: 'sealId_required_alphanumeric' }, { status: 400 });
  }

  const CIVIC_LEDGER_URL = process.env.CIVIC_LEDGER_URL;
  if (!CIVIC_LEDGER_URL) {
    console.warn('[migrate-v1] CIVIC_LEDGER_URL not set — substrate submit skipped');
  }

  const v1Key = `vault:seal:${sealId}`;
  const v1 = await kvGetRaw<V1Seal>(v1Key);
  if (!v1) {
    return NextResponse.json({ ok: false, error: `seal_not_found: ${sealId}` }, { status: 404 });
  }

  if ((v1 as Record<string, unknown>).schema_version) {
    return NextResponse.json({
      ok: false,
      error: 'already_v2',
      schema_version: (v1 as Record<string, unknown>).schema_version,
      sealId,
    }, { status: 409 });
  }

  const ts = Date.now();
  const cycle = process.env.CURRENT_CYCLE ?? 'C-305';

  const v2Seal = {
    ...v1,
    sealId,
    schema_version: 'v2',
    event_id: `${sealId}-migrated-${ts}`,
    agent_id: 'ATLAS',
    agent_origin: 'migration',
    attestation_signature: createHash('sha256')
      .update(`${sealId}:${v1.hash}:${cycle}`)
      .digest('hex'),
    attested_at: ts,
    migrated_from: 'v1',
    migration_cycle: cycle,
    operatorNote: operatorNote ?? null,
    source: 'terminal-migrate-v1',
    terminal_base_url: TERMINAL_REGISTRATION.api_base,
    terminal_id: TERMINAL_REGISTRATION.terminal_id,
    api_base: TERMINAL_REGISTRATION.api_base,
  };

  await kvSetRawKey(v1Key, v2Seal);

  let substrateOk = false;
  if (CIVIC_LEDGER_URL) {
    try {
      const res = await fetch(`${CIVIC_LEDGER_URL}/api/vault/seal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUBSTRATE_TOKEN ?? ''}`,
        },
        body: JSON.stringify(v2Seal),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => `HTTP ${res.status}`);
        console.error(`[migrate-v1] substrate write failed for ${sealId}:`, body);
      } else {
        substrateOk = true;
      }
    } catch (err) {
      console.error(`[migrate-v1] substrate fetch error for ${sealId}:`, err);
    }
  }

  await kvDel(`vault:quarantine:${sealId}`);
  await kvSetRawKey(v1Key, { ...v2Seal, status: 'promoted', promotedAt: ts });

  console.log(`[migrate-v1] ${sealId} migrated v1→v2 @ ${cycle} (substrate: ${substrateOk})`);
  return NextResponse.json({ ok: true, sealId, schema_version: 'v2', cycle, ts, substrateOk });
}

// GET: list all v1 seals still in KV (no schema_version field)
export async function GET() {
  const { keys } = await kvInspectSamples('vault:seal:*', 50);
  const v1Seals: string[] = [];

  for (const row of keys) {
    const data = row.sample as Record<string, unknown> | null;
    if (data && !data.schema_version) {
      v1Seals.push(row.key.replace('vault:seal:', ''));
    }
  }

  return NextResponse.json({ ok: true, v1Count: v1Seals.length, v1Seals });
}
