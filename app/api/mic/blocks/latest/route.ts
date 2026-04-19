/**
 * GET /api/mic/blocks/latest
 *
 * MIC_GENESIS_BLOCK-shaped payload when ledger has not written one yet:
 * returns `ok: false` with reason, or a stub only if env provides values.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cycle = process.env.MIC_GENESIS_STUB_CYCLE?.trim();
  const mintRaw = process.env.MIC_GENESIS_STUB_MINT;
  const giRaw = process.env.MIC_GENESIS_STUB_GI;

  if (!cycle || !mintRaw || !giRaw) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'no_genesis_block',
        message:
          'No genesis block on ledger yet. Set MIC_GENESIS_STUB_* env vars for operator preview, or wire ledger /mic/blocks/latest.',
      },
      { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'mic-blocks-latest' } },
    );
  }

  const mint = Number(mintRaw);
  const gi = Number(giRaw);
  if (!Number.isFinite(mint) || !Number.isFinite(gi)) {
    return NextResponse.json(
      { ok: false, reason: 'invalid_stub_env' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const timestamp = new Date().toISOString();
  return NextResponse.json(
    {
      ok: true,
      stub: true,
      type: 'MIC_GENESIS_BLOCK',
      cycle,
      gi,
      mint,
      timestamp,
      allocation: {
        reserve: Number(process.env.MIC_GENESIS_STUB_RESERVE ?? '0') || undefined,
        operator: Number(process.env.MIC_GENESIS_STUB_OPERATOR ?? '0') || undefined,
        sentinel: Number(process.env.MIC_GENESIS_STUB_SENTINEL ?? '0') || undefined,
        civic: Number(process.env.MIC_GENESIS_STUB_CIVIC ?? '0') || undefined,
        burn: Number(process.env.MIC_GENESIS_STUB_BURN ?? '0') || undefined,
      },
      previous_hash: null,
      hash: null,
      hash_algorithm: 'sha256',
      message: 'Stub preview only — hash populated when monorepo commits block to ledger.',
    },
    { headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'mic-blocks-latest-stub' } },
  );
}
