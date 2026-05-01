import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ExecuteValidationPayload = {
  ok?: boolean;
  executable?: boolean;
  dry_run?: boolean;
  candidate?: {
    id: string;
    action: string;
    lead_agent: string;
    supporting_agents: string[];
    priority: string;
    quorum_required: boolean;
    quorum_threshold: number;
    current_support: number;
    ready: boolean;
    receipt_requirements: string[];
    rationale: string;
  };
  validation?: {
    quorum_ready: boolean;
    receipts_required: string[];
    receipts_present: string[];
    missing_receipts: string[];
    operator_ack: boolean;
    blocked_by: string[];
  };
};

type ReceiptBundleBody = {
  action_id?: string;
  operator_ack?: boolean;
  receipts?: Record<string, unknown>;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

async function validateExecution(request: NextRequest, body: ReceiptBundleBody): Promise<ExecuteValidationPayload> {
  const res = await fetch(new URL('/api/agents/execute-action', request.nextUrl.origin), {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action_id: body.action_id,
      dry_run: true,
      operator_ack: body.operator_ack === true,
      receipts: body.receipts ?? {},
    }),
  });
  return (await res.json()) as ExecuteValidationPayload;
}

function ledgerPreview(bundle: Record<string, unknown>) {
  return {
    id: `agent-action-${bundle.receipt_hash}`,
    type: 'agent_action_receipt',
    category: 'quorum_execution',
    title: `Agent action receipt · ${bundle.action}`,
    summary: `Dry-run validated ${bundle.action} action led by ${bundle.lead_agent}`,
    source: 'agent-receipt-bundle',
    agentOrigin: bundle.lead_agent,
    confidenceTier: bundle.executable ? 4 : 2,
    status: bundle.executable ? 'pending' : 'flagged',
    proofSource: 'receipt_bundle_preview',
    tags: ['c297-phase8', 'agent-action', 'receipt-bundle', bundle.executable ? 'executable' : 'blocked'],
    receipt_hash: bundle.receipt_hash,
    payload_hash: bundle.payload_hash,
    quorum_hash: bundle.quorum_hash,
    created_at: bundle.created_at,
  };
}

export async function POST(request: NextRequest) {
  let body: ReceiptBundleBody = {};
  try {
    body = (await request.json()) as ReceiptBundleBody;
  } catch {
    body = {};
  }

  const validation = await validateExecution(request, body);
  const candidate = validation.candidate;

  if (!candidate) {
    return NextResponse.json(
      {
        ok: false,
        readonly: true,
        error: 'action_candidate_not_found',
        validation,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
    );
  }

  const createdAt = new Date().toISOString();
  const receipts = body.receipts ?? {};
  const payload = {
    action_id: candidate.id,
    action: candidate.action,
    lead_agent: candidate.lead_agent,
    supporting_agents: candidate.supporting_agents,
    priority: candidate.priority,
    quorum_required: candidate.quorum_required,
    quorum_threshold: candidate.quorum_threshold,
    current_support: candidate.current_support,
    operator_ack: body.operator_ack === true,
    receipts,
    validation: validation.validation ?? null,
    rationale: candidate.rationale,
    created_at: createdAt,
  };
  const payloadHash = sha256(payload);
  const quorumHash = sha256({
    action_id: candidate.id,
    supporting_agents: candidate.supporting_agents,
    threshold: candidate.quorum_threshold,
    support: candidate.current_support,
  });
  const receiptHash = sha256({ payloadHash, quorumHash, createdAt });
  const bundle = {
    ...payload,
    executable: validation.executable === true,
    payload_hash: payloadHash,
    quorum_hash: quorumHash,
    receipt_hash: receiptHash,
  };

  return NextResponse.json(
    {
      ok: true,
      readonly: true,
      executed: false,
      version: 'C-297.phase8.receipt-bundle-preview.v1',
      bundle,
      ledger_preview: ledgerPreview(bundle),
      blocked_by: validation.validation?.blocked_by ?? [],
      canon_law: [
        'Receipt bundles are proof previews, not writes.',
        'This endpoint does not mutate Ledger, Vault, Canon, Replay, MIC, Fountain, or GI.',
        'A future write phase may submit ledger_preview only after executable=true and operator approval.',
      ],
      timestamp: createdAt,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'agent-receipt-bundle-preview',
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const res = await fetch(new URL('/api/agents/execute-action', request.nextUrl.origin), { cache: 'no-store' });
  const usage = await res.json();
  return NextResponse.json(
    {
      ok: true,
      readonly: true,
      version: 'C-297.phase8.receipt-bundle-preview.v1',
      usage: {
        method: 'POST',
        body: {
          action_id: usage?.available_actions?.[0]?.id ?? 'action-verify-ZEUS',
          operator_ack: false,
          receipts: {},
        },
      },
      available_actions: usage?.available_actions ?? [],
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
  );
}
