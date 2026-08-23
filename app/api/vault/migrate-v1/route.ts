// C-305 FIX-510-01: v1→v2 seal migration endpoint.
// Upgrades legacy v1 seals (flat `hash` field, no schema_version) to v2 schema
// then re-submits to substrate. Also lists remaining v1 seals via GET.

import { NextResponse } from 'next/server';
import { log } from '@/lib/log';
import { createHash } from 'crypto';
import { kvGetRaw, kvSetRawKey, kvDel, kvInspectSamples } from '@/lib/kv/store';
import { TERMINAL_REGISTRATION } from '@/lib/ledger';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import {
  listV1SealIdsFromKvInspect,
  parseV1SealRecord,
  validateMigratableSealId,
} from '@/lib/vault-v2/reservedSealIds';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { sealId?: string; operatorNote?: string };
  try {
    body = (await req.json()) as { sealId?: string; operatorNote?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const { sealId: rawSealId, operatorNote } = body;
  const idCheck = validateMigratableSealId(rawSealId);
  if (!idCheck.ok) {
    return NextResponse.json({ ok: false, error: idCheck.error }, { status: 400 });
  }
  const sealId = idCheck.sealId;

  const CIVIC_LEDGER_URL = process.env.CIVIC_LEDGER_URL;
  if (!CIVIC_LEDGER_URL) {
    console.warn('[migrate-v1] CIVIC_LEDGER_URL not set — substrate submit skipped');
  }

  const v1Key = `vault:seal:${sealId}`;
  const v1raw = await kvGetRaw<unknown>(v1Key);
  if (!v1raw) {
    return NextResponse.json({ ok: false, error: `seal_not_found: ${sealId}` }, { status: 404 });
  }

  const v1 = parseV1SealRecord(v1raw);
  if (!v1) {
    if (typeof v1raw === 'object' && v1raw !== null && (v1raw as Record<string, unknown>).schema_version) {
      return NextResponse.json(
        {
          ok: false,
          error: 'already_v2',
          schema_version: (v1raw as Record<string, unknown>).schema_version,
          sealId,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: 'not_a_v1_seal_object' }, { status: 409 });
  }

  const ts = Date.now();
  const cycle = await resolveOperatorCycleId();

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
        const resBody = await res.text().catch(() => `HTTP ${res.status}`);
        console.error(`[migrate-v1] substrate write failed for ${sealId}:`, resBody);
      } else {
        substrateOk = true;
      }
    } catch (err) {
      console.error(`[migrate-v1] substrate fetch error for ${sealId}:`, err);
    }
  }

  await kvDel(`vault:quarantine:${sealId}`);
  await kvSetRawKey(v1Key, { ...v2Seal, status: 'promoted', promotedAt: ts });

  log.info(`[migrate-v1] ${sealId} migrated v1→v2 @ ${cycle} (substrate: ${substrateOk})`);
  return NextResponse.json({ ok: true, sealId, schema_version: 'v2', cycle, ts, substrateOk });
}

// GET: list all v1 seals still in KV (no schema_version field)
export async function GET() {
  const { keys } = await kvInspectSamples('vault:seal:*', 50);
  const v1Seals = listV1SealIdsFromKvInspect(keys);

  return NextResponse.json({ ok: true, v1Count: v1Seals.length, v1Seals });
}
