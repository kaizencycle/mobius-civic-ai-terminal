import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ExecutionDryRunPayload = {
  ok?: boolean;
  phase?: string;
  execution_dryrun?: {
    allowed?: boolean;
    confidence?: number;
    steps?: Array<{
      step: number;
      action: string;
      allowed: boolean;
      reason: string;
    }>;
    simulated_effects?: Record<string, string>;
  };
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

async function getDryRun(request: NextRequest): Promise<ExecutionDryRunPayload | null> {
  try {
    const response = await fetch(new URL('/api/system/execution-dryrun', request.nextUrl.origin), { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as ExecutionDryRunPayload;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const dryRun = await getDryRun(request);
  const execution = dryRun?.execution_dryrun ?? null;
  const createdAt = new Date().toISOString();

  const receiptPayload = {
    phase: 'C-298.phase19.execution-receipt-preview',
    source_phase: dryRun?.phase ?? 'unknown',
    dry_run_allowed: execution?.allowed ?? false,
    confidence: execution?.confidence ?? 0,
    steps: execution?.steps ?? [],
    simulated_effects: execution?.simulated_effects ?? {},
    created_at: createdAt,
  };

  const payloadHash = sha256(receiptPayload);
  const stepsHash = sha256(receiptPayload.steps);
  const effectsHash = sha256(receiptPayload.simulated_effects);
  const receiptHash = sha256({ payloadHash, stepsHash, effectsHash, createdAt });

  return NextResponse.json(
    {
      ok: true,
      readonly: true,
      phase: 'C-298.phase19.execution-receipt-preview',
      authoritative: false,
      receipt_preview: {
        id: `execution-dryrun-${receiptHash}`,
        type: 'execution_dryrun_receipt_preview',
        payload_hash: payloadHash,
        steps_hash: stepsHash,
        effects_hash: effectsHash,
        receipt_hash: receiptHash,
        allowed: receiptPayload.dry_run_allowed,
        confidence: receiptPayload.confidence,
        created_at: createdAt,
      },
      payload: receiptPayload,
      next_action: execution?.allowed
        ? 'operator_may_review_phase20_receipt_persistence_contract'
        : 'resolve_execution_dryrun_blockers_before_receipt_persistence',
      canon_law: [
        'Execution receipt preview is not a ledger receipt.',
        'This endpoint produces deterministic hashes only and writes nothing.',
        'No Ledger, Vault, Canon, Replay, MIC, Fountain, GI, or seal mutation occurs.',
        'Future receipt persistence must require operator acknowledgement and dedupe protection.',
      ],
      timestamp: createdAt,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'execution-receipt-preview',
      },
    },
  );
}
