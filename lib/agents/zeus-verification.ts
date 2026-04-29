import type { AgentLedgerAdapterPreview } from '@/lib/agents/ledger-adapter';

export type ZeusVerificationResult = {
  zeus_verified: boolean;
  zeus_reason: string;
  confidence: number;
  checks: {
    eligible: boolean;
    agent_identity: boolean;
    cycle_present: boolean;
    title_or_summary_present: boolean;
    source_lineage_present: boolean;
    confidence_floor_met: boolean;
    not_blocked: boolean;
  };
};

const MIN_CONFIDENCE_TIER = 2;

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeConfidenceTier(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function verifyWithZeus(preview: AgentLedgerAdapterPreview): ZeusVerificationResult {
  const entry = preview.ledger_entry;
  const confidenceTier = normalizeConfidenceTier(entry.confidenceTier);
  const checks = {
    eligible: preview.decision.eligible,
    agent_identity: hasText(preview.agent),
    cycle_present: hasText(preview.cycle),
    title_or_summary_present: hasText(entry.title) || hasText(entry.summary),
    source_lineage_present: hasText(preview.journal_id) && entry.source === 'agent_commit',
    confidence_floor_met: confidenceTier >= MIN_CONFIDENCE_TIER,
    not_blocked: preview.decision.canonState !== 'blocked' && entry.status !== 'reverted',
  };

  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  if (failed.length > 0) {
    return {
      zeus_verified: false,
      zeus_reason: `failed:${failed.join(',')}`,
      confidence: Number(Math.max(0.1, confidenceTier / 4 - failed.length * 0.1).toFixed(2)),
      checks,
    };
  }

  return {
    zeus_verified: true,
    zeus_reason: 'passed_integrity_checks',
    confidence: Number(Math.min(0.95, Math.max(0.65, confidenceTier / 4)).toFixed(2)),
    checks,
  };
}
