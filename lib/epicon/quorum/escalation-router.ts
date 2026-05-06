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

  const hasReplayReason = receipt.reasons.some((reason) =>
    reason.toLowerCase().includes('replay'),
  );

  if (hasReplayReason) {
    reasons.push('replay_risk');
  }

  const hasSensitiveReason = receipt.reasons.some((reason) => {
    const normalizedReason = reason.toLowerCase();
    return (
      normalizedReason.includes('sensitive') ||
      normalizedReason.includes('auth') ||
      normalizedReason.includes('secret') ||
      normalizedReason.includes('middleware')
    );
  });

  if (hasSensitiveReason) {
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
