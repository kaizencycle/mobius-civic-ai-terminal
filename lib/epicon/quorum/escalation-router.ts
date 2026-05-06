import type { EpiconGovernanceReceipt } from '../runtime/types';
import type {
  EpiconQuorumEscalationReason,
  EpiconQuorumPacket,
} from './types';

function determineReasons(
  receipt: EpiconGovernanceReceipt,
): EpiconQuorumEscalationReason[] {
  const reasons: EpiconQuorumEscalationReason[] = [];

  if (receipt.severity === 'high') {
    reasons.push('high_runtime_risk');
  }

  if (receipt.verdict === 'quarantine') {
    reasons.push('quarantine_recommended');
  }

  const hasReplayRisk = receipt.policyHits?.some(
    (hit) => hit.id === 'replay-risk',
  );

  if (hasReplayRisk) {
    reasons.push('replay_risk');
  }

  const hasSensitivePolicyHit = receipt.policyHits?.some(
    (hit) => hit.id === 'sensitive-paths',
  );

  if (hasSensitivePolicyHit) {
    reasons.push('sensitive_policy_hit');
  }

  return reasons;
}

export function shouldEscalateToQuorum(
  receipt: EpiconGovernanceReceipt,
): boolean {
  return determineReasons(receipt).length > 0;
}

export function buildEscalationPreview(
  receipt: EpiconGovernanceReceipt,
): Pick<EpiconQuorumPacket, 'tier' | 'reasons' | 'requestedAgents'> {
  const reasons = determineReasons(receipt);

  return {
    tier: 'tier_2_agent_quorum',
    reasons,
    requestedAgents: ['ATLAS', 'AUREA', 'EVE'],
  };
}
