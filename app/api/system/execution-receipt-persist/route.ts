import { NextRequest, NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RECEIPTS_KEY = 'execution:receipt-previews';
const MAX_RECEIPTS = 100;

type ReceiptPreviewPayload = {
  ok?: boolean;
  receipt_preview?: {
    id: string;
    type: string;
    payload_hash: string;
    steps_hash: string;
    effects_hash: string;
    receipt_hash: string;
    allowed: boolean;
    confidence: number;
    created_at: string;
  };
  payload?: Record<string, unknown>;
};

type StoredExecutionReceiptPreview = {
  id: string;
  type: string;
  receipt_hash: string;
  payload_hash: string;
  steps_hash: string;
  effects_hash: string;
  allowed: boolean;
  confidence: number;
  created_at: string;
  persisted_at: string;
  authoritative: false;
};

async function getPreview(request: NextRequest): Promise<ReceiptPreviewPayload | null> {
  try {
    const response = await fetch(new URL('/api/system/execution-receipt-preview', request.nextUrl.origin), { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as ReceiptPreviewPayload;
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
    return NextResponse.json(
      {
        ok: false,
        persisted: false,
        error: 'operator_ack_required',
        canon_law: ['Receipt persistence requires explicit operator acknowledgement.'],
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
    );
  }

  const preview = await getPreview(request);
  const receipt = preview?.receipt_preview;

  if (!receipt) {
    return NextResponse.json(
      { ok: false, persisted: false, error: 'receipt_preview_unavailable', timestamp: new Date().toISOString() },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
    );
  }

  const existing = (await kvGet<StoredExecutionReceiptPreview[]>(RECEIPTS_KEY)) ?? [];
  const duplicate = existing.find((item) => item.receipt_hash === receipt.receipt_hash);

  if (duplicate) {
    return NextResponse.json(
      {
        ok: true,
        persisted: false,
        duplicate: true,
        receipt: duplicate,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
    );
  }

  const stored: StoredExecutionReceiptPreview = {
    id: receipt.id,
    type: receipt.type,
    receipt_hash: receipt.receipt_hash,
    payload_hash: receipt.payload_hash,
    steps_hash: receipt.steps_hash,
    effects_hash: receipt.effects_hash,
    allowed: receipt.allowed,
    confidence: receipt.confidence,
    created_at: receipt.created_at,
    persisted_at: new Date().toISOString(),
    authoritative: false,
  };

  await kvSet(RECEIPTS_KEY, [stored, ...existing].slice(0, MAX_RECEIPTS), 60 * 60 * 24 * 30);

  return NextResponse.json(
    {
      ok: true,
      persisted: true,
      phase: 'C-298.phase20.execution-receipt-persistence',
      authoritative: false,
      receipt: stored,
      canon_law: [
        'Receipt persistence does not equal execution.',
        'Stored receipts are historical previews, not authoritative truth.',
        'No Ledger, Vault, Canon, Replay, MIC, Fountain, GI, or seal mutation occurs.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'execution-receipt-persist',
      },
    },
  );
}

export async function GET() {
  const receipts = (await kvGet<StoredExecutionReceiptPreview[]>(RECEIPTS_KEY)) ?? [];
  return NextResponse.json(
    {
      ok: true,
      readonly: true,
      phase: 'C-298.phase20.execution-receipt-persistence',
      count: receipts.length,
      receipts,
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
  );
}
