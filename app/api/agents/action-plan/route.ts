import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type AgentDecision = {
  agent: string;
  role: string;
  action: 'observe' | 'stabilize' | 'verify' | 'attest' | 'replay_check' | 'escalate';
  priority: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  reasoning: string;
  inputs: string[];
};

type ReasoningPayload = {
  ok?: boolean;
  decisions?: AgentDecision[];
  summary?: Record<string, unknown>;
  timestamp?: string;
};

type ActionCandidate = {
  id: string;
  action: AgentDecision['action'];
  lead_agent: string;
  supporting_agents: string[];
  priority: AgentDecision['priority'];
  quorum_required: boolean;
  quorum_threshold: number;
  current_support: number;
  ready: boolean;
  receipt_requirements: string[];
  blocked_by: string[];
  rationale: string;
};

async function fetchReasoning(request: NextRequest): Promise<ReasoningPayload> {
  const res = await fetch(new URL('/api/agents/reasoning', request.nextUrl.origin), { cache: 'no-store' });
  const json = (await res.json()) as ReasoningPayload;
  if (!res.ok || json?.ok === false) throw new Error('agent_reasoning_unavailable');
  return json;
}

function priorityRank(priority: AgentDecision['priority']): number {
  if (priority === 'critical') return 4;
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

function receiptsForAction(action: AgentDecision['action']): string[] {
  switch (action) {
    case 'attest':
      return ['agent_signature', 'seal_id', 'proof_source', 'ledger_receipt'];
    case 'verify':
      return ['agent_signature', 'verification_verdict', 'input_hash', 'timestamp'];
    case 'replay_check':
      return ['agent_signature', 'replay_snapshot_hash', 'quorum_hash', 'history_preserved'];
    case 'stabilize':
      return ['agent_signature', 'gi_before', 'gi_after_expected', 'signal_driver_hash'];
    case 'escalate':
      return ['agent_signature', 'risk_reason', 'affected_lanes', 'operator_ack_required'];
    default:
      return ['agent_signature', 'observation_hash', 'timestamp'];
  }
}

function supportForAction(decisions: AgentDecision[], action: AgentDecision['action']): AgentDecision[] {
  if (action === 'verify') return decisions.filter((d) => d.action === 'verify' || d.action === 'attest' || d.action === 'replay_check');
  if (action === 'attest') return decisions.filter((d) => d.action === 'attest' || d.action === 'verify');
  if (action === 'replay_check') return decisions.filter((d) => d.action === 'replay_check' || d.action === 'verify' || d.action === 'attest');
  if (action === 'stabilize') return decisions.filter((d) => d.action === 'stabilize' || d.action === 'escalate');
  if (action === 'escalate') return decisions.filter((d) => d.action === 'escalate' || d.priority === 'critical');
  return decisions.filter((d) => d.action === action);
}

function buildCandidates(decisions: AgentDecision[]): ActionCandidate[] {
  const active = decisions.filter((d) => d.action !== 'observe');
  const actions = Array.from(new Set(active.map((d) => d.action)));

  return actions.map((action) => {
    const direct = active.filter((d) => d.action === action).sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));
    const lead = direct[0] ?? active[0]!;
    const support = supportForAction(decisions, action);
    const threshold = action === 'escalate' ? 1 : action === 'stabilize' ? 2 : 3;
    const quorumRequired = action !== 'observe' && action !== 'escalate';
    const currentSupport = support.length;
    const ready = quorumRequired ? currentSupport >= threshold : currentSupport >= 1;
    const blockedBy = ready ? [] : [`needs_${threshold - currentSupport}_more_agent_support`];

    return {
      id: `action-${action}-${lead.agent}`,
      action,
      lead_agent: lead.agent,
      supporting_agents: support.map((d) => d.agent),
      priority: direct.reduce<AgentDecision['priority']>((max, d) => (priorityRank(d.priority) > priorityRank(max) ? d.priority : max), lead.priority),
      quorum_required: quorumRequired,
      quorum_threshold: threshold,
      current_support: currentSupport,
      ready,
      receipt_requirements: receiptsForAction(action),
      blocked_by: blockedBy,
      rationale: lead.reasoning,
    };
  }).sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || Number(b.ready) - Number(a.ready));
}

export async function GET(request: NextRequest) {
  try {
    const reasoning = await fetchReasoning(request);
    const decisions = reasoning.decisions ?? [];
    const candidates = buildCandidates(decisions);

    return NextResponse.json(
      {
        ok: true,
        readonly: true,
        version: 'C-297.phase6.quorum-action-plan.v1',
        source: 'agent-reasoning-to-action-candidates',
        decisions_count: decisions.length,
        candidates,
        summary: {
          total_candidates: candidates.length,
          ready: candidates.filter((c) => c.ready).length,
          blocked: candidates.filter((c) => !c.ready).length,
          quorum_required: candidates.filter((c) => c.quorum_required).length,
        },
        canon_law: [
          'Action candidates are plans, not executions.',
          'No Ledger, Vault, Canon, Replay, MIC, or Fountain mutation occurs here.',
          'Future execution must require receipts, quorum threshold, and operator-visible proof.',
        ],
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
          'X-Mobius-Source': 'agent-action-plan',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        readonly: true,
        error: error instanceof Error ? error.message : 'action_plan_failed',
        candidates: [],
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' } },
    );
  }
}
