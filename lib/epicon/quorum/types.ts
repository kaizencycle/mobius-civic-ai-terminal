import type { EpiconGovernanceReceipt } from '../runtime/types';

export type EpiconQuorumTier = 'tier_2_agent_quorum' | 'tier_3_operator_review';

export type EpiconQuorumAgentId = 'ATLAS' | 'AUREA' | 'EVE' | 'JADE' | 'HERMES';

export type EpiconQuorumEscalationReason =
  | 'high_runtime_risk'
  | 'quarantine_recommended'
  | 'sensitive_policy_hit'
  | 'replay_risk'
  | 'operator_requested';

export type EpiconQuorumPacket = {
  packetId: string;
  tier: EpiconQuorumTier;
  receipt: EpiconGovernanceReceipt;
  reasons: EpiconQuorumEscalationReason[];
  requestedAgents: EpiconQuorumAgentId[];
  createdAt: string;
  enforcement: 'disabled';
};

export type EpiconAgentParticipationReceipt = {
  agent: EpiconQuorumAgentId;
  status: 'pending' | 'accepted' | 'declined' | 'timed_out';
  confidence: number | null;
  note: string | null;
};

export type EpiconQuorumDecision = {
  packetId: string;
  status: 'not_required' | 'pending' | 'quorum_ready' | 'timed_out' | 'operator_review_required';
  participatingAgents: EpiconAgentParticipationReceipt[];
  finalRecommendation: 'pass' | 'clarify' | 'quarantine' | 'operator_review';
  enforcement: 'disabled';
  decidedAt: string;
};
