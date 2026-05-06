import type {
  EpiconAgentParticipationReceipt,
  EpiconQuorumDecision,
  EpiconQuorumPacket,
} from './types';

function buildPendingParticipation(
  packet: EpiconQuorumPacket,
): EpiconAgentParticipationReceipt[] {
  return packet.requestedAgents.map((agent) => ({
    agent,
    status: 'pending',
    confidence: null,
    note: null,
  }));
}

export function buildQuorumDecision(
  packet: EpiconQuorumPacket,
): EpiconQuorumDecision {
  const requiresOperatorReview = packet.reasons.includes('operator_requested');
  const requiresQuarantine =
    packet.reasons.includes('quarantine_recommended') ||
    packet.reasons.includes('high_runtime_risk');

  return {
    packetId: packet.packetId,
    status: requiresOperatorReview ? 'operator_review_required' : 'pending',
    participatingAgents: buildPendingParticipation(packet),
    finalRecommendation: requiresOperatorReview
      ? 'operator_review'
      : requiresQuarantine
        ? 'quarantine'
        : 'clarify',
    enforcement: 'disabled',
    decidedAt: new Date().toISOString(),
  };
}
