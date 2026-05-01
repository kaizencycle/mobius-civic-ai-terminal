import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ActionCandidate = {
  id: string;
  action: 'observe' | 'stabilize' | 'verify' | 'attest' | 'replay_check' | 'escalate';
  lead_agent: string;
  supporting_agents: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  quorum_required: boolean;
  quorum_threshold: number;
  current_support: number;
  ready: boolean;
  receipt_requirements: string[];
  blocked_by: string[];
  rationale: string;
};

type ActionPlanPayload = {
  ok?: boolean;
  candidates?: ActionCandidate[];
};

type ExecuteBody = {
  action_id?: string;
  dry_run?: boolean;
  receipts?: Record<string, unknown>;
  operator_ack?: boolean;
};

async function fetchActionPlan(request: NextRequest): Promise<ActionCandidate[]> {
  const res = await fetch(new URL('/api/agents/action-plan', request.nextUrl.origin), { cache: 'no-store' });
  const json = (await res.json()) as ActionPlanPayload;
  if (!res.ok || json?.ok === false) throw new Error('action_plan_unavailable');
  return Array.isArray(json.candidates) ? json.candidates : [];
}

function missingReceipts(candidate: ActionCandidate, receipts: Record<string, unknown>): string[] {
  return candidate.receipt_requirements.filter((key) => receipts[key] === undefined || receipts[key] === null || receipts[key] === '');
}

function executionEffect(candidate: ActionCandidate): string {
  switch (candidate.action) {
    case 'verify':
      return 'would prepare verification receipt for later ledger/quorum write';
    case 'attest':
      return 'would prepare attestation receipt for later seal/canon review';
    case 'replay_check':
      return 'would prepare replay quorum check receipt without replay mutation';
    case 'stabilize':
      return 'would prepare stabilization recommendation without changing GI directly';
    case 'escalate':
      return 'would prepare operator escalation notice without state mutation';
    default:
      return 'would observe only';
  }
}

export async function POST(request: NextRequest) {
  let body: ExecuteBody = {};
  try {
    body = (await request.json()) as ExecuteBody;
  } catch {
    body = {};
  }

  const actionId = typeof body.action_id === 'string' ? body.action_id : null;
  const dryRun = body.dry_run !== false;
  const receipts = body.receipts && typeof body.receipts === 'object' ? body.receipts : {};
  const operatorAck = body.operator_ack === true;

  try {
    const candidates = await fetchActionPlan(request);
    const candidate = actionId ? candidates.find((item) => item.id === actionId) : candidates[0];

    if (!candidate) {
      return NextResponse.json(
        {
          ok: false,
          readonly: true,
          executed: false,
          error: 'action_candidate_not_found',
          available_actions: candidates.map((item) => item.id),
          timestamp: new Date().toISOString(),
        },
        { status: 200, headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
      );
    }

    const missing = missingReceipts(candidate, receipts);
    const blockedBy = [
      ...candidate.blocked_by,
      ...(candidate.ready ? [] : ['quorum_not_ready']),
      ...(missing.length ? [`missing_receipts:${missing.join(',')}`] : []),
      ...(operatorAck ? [] : ['operator_ack_required']),
    ];
    const executable = candidate.ready && missing.length === 0 && operatorAck;

    return NextResponse.json(
      {
        ok: true,
        readonly: true,
        dry_run: dryRun,
        executed: false,
        executable,
        version: 'C-297.phase7.dry-run-execution-gate.v1',
        candidate,
        validation: {
          quorum_ready: candidate.ready,
          quorum_required: candidate.quorum_required,
          quorum_threshold: candidate.quorum_threshold,
          current_support: candidate.current_support,
          receipts_required: candidate.receipt_requirements,
          receipts_present: Object.keys(receipts),
          missing_receipts: missing,
          operator_ack: operatorAck,
          blocked_by: blockedBy,
        },
        effect: executionEffect(candidate),
        canon_law: [
          'This endpoint validates execution readiness only.',
          'It never mutates Ledger, Vault, Canon, Replay, MIC, Fountain, or GI.',
          'A future execution phase must preserve receipts, operator acknowledgement, and quorum proof before any write.',
        ],
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
          'X-Mobius-Source': 'agent-execute-action-dry-run',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        readonly: true,
        executed: false,
        error: error instanceof Error ? error.message : 'execute_action_failed',
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
    );
  }
}

export async function GET(request: NextRequest) {
  const candidates = await fetchActionPlan(request).catch(() => []);
  return NextResponse.json(
    {
      ok: true,
      readonly: true,
      version: 'C-297.phase7.dry-run-execution-gate.v1',
      usage: {
        method: 'POST',
        body: {
          action_id: candidates[0]?.id ?? 'action-verify-ZEUS',
          dry_run: true,
          operator_ack: false,
          receipts: {},
        },
      },
      available_actions: candidates.map((item) => ({
        id: item.id,
        action: item.action,
        lead_agent: item.lead_agent,
        ready: item.ready,
        quorum: `${item.current_support}/${item.quorum_threshold}`,
        receipt_requirements: item.receipt_requirements,
      })),
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
  );
}
