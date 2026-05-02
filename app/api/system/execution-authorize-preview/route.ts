import { NextRequest, NextResponse } from 'next/server';
import { kvGet } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RECEIPTS_KEY = 'execution:receipt-previews';

async function getLatestReceipt() {
  const receipts = (await kvGet<any[]>(RECEIPTS_KEY)) ?? [];
  return receipts[0] ?? null;
}

async function getDryRun(request: NextRequest) {
  try {
    const res = await fetch(new URL('/api/system/execution-dryrun', request.nextUrl.origin), { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: { operator_ack?: boolean } = {};
  try {
    body = (await request.json()) as { operator_ack?: boolean };
  } catch {
    body = {};
  }

  if (body.operator_ack !== true) {
    return NextResponse.json({ ok: false, authorized: false, error: 'operator_ack_required' });
  }

  const latestReceipt = await getLatestReceipt();
  const dryRun = await getDryRun(request);

  if (!latestReceipt || !dryRun?.execution_dryrun) {
    return NextResponse.json({ ok: false, authorized: false, error: 'missing_state' });
  }

  const currentAllowed = dryRun.execution_dryrun.allowed;
  const currentConfidence = dryRun.execution_dryrun.confidence;

  const match = latestReceipt.allowed === currentAllowed && latestReceipt.confidence === currentConfidence;

  const authorized = match && currentAllowed === true;

  return NextResponse.json({
    ok: true,
    phase: 'C-298.phase21.execution-authorization-preview',
    authoritative: false,

    authorization: {
      authorized,
      receipt_match: match,
      receipt_allowed: latestReceipt.allowed,
      current_allowed: currentAllowed,
      confidence_match: latestReceipt.confidence === currentConfidence,
    },

    next_action: authorized
      ? 'ready_for_future_execution_layer'
      : 're-run_dryrun_and_persist_new_receipt_before_authorization',

    canon_law: [
      'Execution authorization requires receipt match and operator acknowledgement.',
      'Authorization does not execute any action.',
      'No Ledger, Vault, Canon, Replay, MIC, or GI mutation occurs.',
      'Authorization fails if system state drifts from receipt.',
    ],

    timestamp: new Date().toISOString(),
  });
}
