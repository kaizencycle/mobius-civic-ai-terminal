import type { LedgerEntry } from '@/lib/terminal/types';

export type AgentLedgerJournalEntry = {
  id: string;
  agent: string;
  cycle: string;
  timestamp: string;
  scope: string;
  observation: string;
  inference: string;
  recommendation: string;
  confidence: number;
  derivedFrom: string[];
  status: 'draft' | 'committed' | 'contested' | 'verified';
  category: 'observation' | 'inference' | 'alert' | 'recommendation' | 'close';
  severity: 'nominal' | 'elevated' | 'critical';
  source: 'agent-journal';
  agentOrigin: string;
  tags?: string[];
  source_mode?: 'kv' | 'substrate';
  canonical_path?: string;
};

export type AgentLedgerAdapterDecision = {
  eligible: boolean;
  reason: string;
  proofSource: string;
  canonState: NonNullable<LedgerEntry['canonState']>;
  status: LedgerEntry['status'];
  integrityDelta: number;
};

export type AgentLedgerAdapterPreview = {
  journal_id: string;
  agent: string;
  cycle: string;
  timestamp: string;
  decision: AgentLedgerAdapterDecision;
  ledger_entry: LedgerEntry;
};

export type AgentLedgerAdapterSummary = {
  total: number;
  eligible: number;
  blocked: number;
  by_agent: Record<string, { total: number; eligible: number; blocked: number }>;
};

function normalizeAgent(agent: string): string {
  return agent.trim().toUpperCase() || 'UNKNOWN';
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function decisionForJournal(entry: AgentLedgerJournalEntry): AgentLedgerAdapterDecision {
  const confidence = clampConfidence(entry.confidence);
  if (entry.status === 'draft') {
    return {
      eligible: false,
      reason: 'draft_journal_entries_do_not_enter_ledger',
      proofSource: 'agent_journal_draft',
      canonState: 'hot',
      status: 'pending',
      integrityDelta: 0,
    };
  }

  if (entry.status === 'contested') {
    return {
      eligible: false,
      reason: 'contested_journal_requires_zeus_review',
      proofSource: 'agent_journal_contested',
      canonState: 'blocked',
      status: 'reverted',
      integrityDelta: -0.001,
    };
  }

  if (entry.severity === 'critical' && confidence >= 0.7) {
    return {
      eligible: true,
      reason: 'critical_agent_alert_is_ledger_candidate',
      proofSource: 'agent_journal_critical_alert',
      canonState: 'candidate',
      status: 'committed',
      integrityDelta: 0.0015,
    };
  }

  if (entry.status === 'verified') {
    return {
      eligible: true,
      reason: 'verified_agent_journal_is_attestation_candidate',
      proofSource: 'agent_journal_verified',
      canonState: 'attested',
      status: 'committed',
      integrityDelta: 0.001,
    };
  }

  if (entry.status === 'committed' && confidence >= 0.65) {
    return {
      eligible: true,
      reason: 'committed_agent_journal_meets_confidence_floor',
      proofSource: 'agent_journal_committed',
      canonState: 'candidate',
      status: 'committed',
      integrityDelta: entry.severity === 'elevated' ? 0.0008 : 0.0005,
    };
  }

  return {
    eligible: false,
    reason: 'journal_below_ledger_confidence_floor',
    proofSource: 'agent_journal_low_confidence',
    canonState: 'hot',
    status: 'pending',
    integrityDelta: 0,
  };
}

export function adaptAgentJournalToLedger(entry: AgentLedgerJournalEntry): AgentLedgerAdapterPreview {
  const agent = normalizeAgent(entry.agentOrigin || entry.agent);
  const decision = decisionForJournal(entry);
  const title = entry.inference || entry.observation || `${agent} journal entry`;
  const summary = [entry.observation, entry.recommendation].filter(Boolean).join(' Recommendation: ');

  return {
    journal_id: entry.id,
    agent,
    cycle: entry.cycle,
    timestamp: entry.timestamp,
    decision,
    ledger_entry: {
      id: `agent-ledger-${entry.id}`,
      cycleId: entry.cycle,
      type: 'attestation',
      agentOrigin: agent,
      timestamp: entry.timestamp,
      title,
      summary: summary || title,
      integrityDelta: decision.integrityDelta,
      status: decision.status,
      statusReason: decision.reason,
      proofSource: decision.proofSource,
      canonState: decision.canonState,
      category: entry.category === 'alert'
        ? 'civic-risk'
        : entry.category === 'recommendation'
          ? 'governance'
          : 'infrastructure',
      confidenceTier: Math.round(clampConfidence(entry.confidence) * 4),
      tags: Array.from(new Set([...(entry.tags ?? []), 'agent-ledger-preview', entry.category, entry.severity])),
      source: 'agent_commit',
    },
  };
}

export function summarizeAgentLedgerPreview(previews: AgentLedgerAdapterPreview[]): AgentLedgerAdapterSummary {
  const summary: AgentLedgerAdapterSummary = {
    total: previews.length,
    eligible: previews.filter((preview) => preview.decision.eligible).length,
    blocked: previews.filter((preview) => !preview.decision.eligible).length,
    by_agent: {},
  };

  for (const preview of previews) {
    if (!summary.by_agent[preview.agent]) {
      summary.by_agent[preview.agent] = { total: 0, eligible: 0, blocked: 0 };
    }
    summary.by_agent[preview.agent].total += 1;
    if (preview.decision.eligible) summary.by_agent[preview.agent].eligible += 1;
    else summary.by_agent[preview.agent].blocked += 1;
  }

  return summary;
}
