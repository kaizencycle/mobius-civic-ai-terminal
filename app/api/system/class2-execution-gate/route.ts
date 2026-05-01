import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type QuorumIntegrityPayload = {
  ok?: boolean;
  quorum_integrity?: {
    missing_agents?: string[];
    passed_agents?: number;
    average_integrity?: number;
    partial_consensus_score?: number;
    degraded?: boolean;
    state?: string;
    rows?: Array<{
      agent: string;
      present: boolean;
      confidence: number;
      passed: boolean;
      route: string;
      integrity_score: number;
    }>;
  };
};

type GateBody = {
  operator_ack?: boolean;
  operator_override?: boolean;
  reason?: string;
};

async function getQuorumIntegrity(request: NextRequest): Promise<QuorumIntegrityPayload | null> {
  try {
    const response = await fetch(new URL('/api/system/quorum-integrity', request.nextUrl.origin), { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as QuorumIntegrityPayload;
  } catch {
    return null;
  }
}

function evaluateGate(quorum: QuorumIntegrityPayload | null, body: GateBody) {
  const integrity = quorum?.quorum_integrity;
  const mii = integrity?.partial_consensus_score ?? 0;
  const missingAgents = integrity?.missing_agents ?? [];
  const degraded = integrity?.degraded ?? true;
  const passedAgents = integrity?.passed_agents ?? 0;
  const blockedBy: string[] = [];

  if (!integrity) blockedBy.push('quorum_integrity_unavailable');
  if (mii < 0.85) blockedBy.push('mii_below_class2_threshold');
  if (missingAgents.length > 0) blockedBy.push(`missing_agents:${missingAgents.join(',')}`);
  if (degraded) blockedBy.push('quorum_integrity_degraded');
  if (passedAgents < 5) blockedBy.push('required_agents_not_all_passed');
  if (body.operator_ack !== true) blockedBy.push('operator_ack_required');

  const overrideEligible = body.operator_override === true && body.operator_ack === true && Boolean(body.reason);
  const wouldAllow = blockedBy.length === 0;

  return {
    mii,
    passedAgents,
    missingAgents,
    degraded,
    overrideEligible,
    wouldAllow,
    blockedBy,
  };
}

async function handle(request: NextRequest, body: GateBody = {}) {
  const quorum = await getQuorumIntegrity(request);
  const gate = evaluateGate(quorum, body);

  return NextResponse.json(
    {
      ok: true,
      readonly: true,
      phase: 'C-298.phase17.class2-execution-gate',
      class: 'Class 2 — Quorum Attestation',
      authority: false,
      execution_enabled: false,
      would_execute: false,
      gate,
      override: {
        requested: body.operator_override === true,
        eligible: gate.overrideEligible,
        note: gate.overrideEligible
          ? 'Override is recorded as eligible for review only; it still does not execute in Phase 17.'
          : 'Override requires operator_ack=true and a non-empty reason.',
      },
      quorum_integrity: quorum?.quorum_integrity ?? null,
      next_action: gate.wouldAllow
        ? 'operator_may_review_phase18_class2_dry_run_receipt_write_contract'
        : 'resolve_blockers_before_any_class2_execution_design',
      canon_law: [
        'Class 2 gate evaluates whether quorum attestation execution would be allowed.',
        'Phase 17 never executes quorum, writes attestations, seals Vault, promotes Canon, mutates Replay, changes GI, MIC, or Fountain.',
        'Operator override is advisory review metadata only in this phase.',
        'MII below threshold must block execution design until corrected or explicitly reviewed by operator policy.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'class2-execution-gate',
      },
    },
  );
}

export async function GET(request: NextRequest) {
  return handle(request, {});
}

export async function POST(request: NextRequest) {
  let body: GateBody = {};
  try {
    body = (await request.json()) as GateBody;
  } catch {
    body = {};
  }
  return handle(request, body);
}
