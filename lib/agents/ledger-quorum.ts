import type { AgentLedgerAdapterPreview } from '@/lib/agents/ledger-adapter';

export type AgentLedgerQuorumGroup = {
  key: string;
  cycle: string;
  category: string;
  severity: string;
  agents: string[];
  journal_ids: string[];
  eligible_count: number;
  total_count: number;
  quorum_required: number;
  quorum_reached: boolean;
  status: 'quorum_reached' | 'needs_more_agents' | 'blocked';
  average_integrity_delta: number;
  reasons: string[];
};

export type AgentLedgerQuorumSummary = {
  total_groups: number;
  quorum_reached: number;
  needs_more_agents: number;
  blocked: number;
  quorum_required: number;
};

function normalize(value: string | undefined, fallback: string): string {
  const text = value?.trim().toLowerCase();
  return text && text.length > 0 ? text : fallback;
}

function groupKey(preview: AgentLedgerAdapterPreview): string {
  const category = normalize(preview.ledger_entry.category, 'uncategorized');
  const severity = normalize(preview.ledger_entry.tags?.find((tag) => tag === 'critical' || tag === 'elevated' || tag === 'nominal'), 'nominal');
  return `${preview.cycle}:${category}:${severity}`;
}

export function buildAgentLedgerQuorumGroups(
  previews: AgentLedgerAdapterPreview[],
  quorumRequired = 3,
): { summary: AgentLedgerQuorumSummary; groups: AgentLedgerQuorumGroup[] } {
  const grouped = new Map<string, AgentLedgerAdapterPreview[]>();

  for (const preview of previews) {
    const key = groupKey(preview);
    const list = grouped.get(key) ?? [];
    list.push(preview);
    grouped.set(key, list);
  }

  const groups = Array.from(grouped.entries()).map(([key, rows]): AgentLedgerQuorumGroup => {
    const eligible = rows.filter((row) => row.decision.eligible);
    const agents = Array.from(new Set(eligible.map((row) => row.agent))).sort();
    const [cycle, category, severity] = key.split(':');
    const quorumReached = agents.length >= quorumRequired;
    const blocked = eligible.length === 0;
    const status: AgentLedgerQuorumGroup['status'] = quorumReached
      ? 'quorum_reached'
      : blocked
        ? 'blocked'
        : 'needs_more_agents';
    const averageIntegrityDelta = eligible.length > 0
      ? eligible.reduce((sum, row) => sum + row.decision.integrityDelta, 0) / eligible.length
      : 0;

    return {
      key,
      cycle: cycle ?? 'C-—',
      category: category ?? 'uncategorized',
      severity: severity ?? 'nominal',
      agents,
      journal_ids: eligible.map((row) => row.journal_id),
      eligible_count: eligible.length,
      total_count: rows.length,
      quorum_required: quorumRequired,
      quorum_reached: quorumReached,
      status,
      average_integrity_delta: Number(averageIntegrityDelta.toFixed(6)),
      reasons: Array.from(new Set(rows.map((row) => row.decision.reason))).slice(0, 5),
    };
  }).sort((a, b) => {
    if (a.quorum_reached !== b.quorum_reached) return a.quorum_reached ? -1 : 1;
    return b.eligible_count - a.eligible_count;
  });

  const summary: AgentLedgerQuorumSummary = {
    total_groups: groups.length,
    quorum_reached: groups.filter((group) => group.status === 'quorum_reached').length,
    needs_more_agents: groups.filter((group) => group.status === 'needs_more_agents').length,
    blocked: groups.filter((group) => group.status === 'blocked').length,
    quorum_required: quorumRequired,
  };

  return { summary, groups };
}
