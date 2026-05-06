import type { EpiconQuorumDecision, EpiconQuorumPacket } from './types';

function formatReasons(packet: EpiconQuorumPacket): string[] {
  if (packet.reasons.length === 0) return ['- no quorum escalation reasons detected'];

  return packet.reasons.map((reason) => `- ${reason}`);
}

function formatAgents(decision: EpiconQuorumDecision): string[] {
  if (decision.participatingAgents.length === 0) return ['- no agents requested'];

  return decision.participatingAgents.map(
    (agent) => `- ${agent.agent}: ${agent.status}`,
  );
}

export function buildQuorumSummary(
  packet: EpiconQuorumPacket,
  decision: EpiconQuorumDecision,
): string {
  return [
    '## EPICON Quorum Preview',
    '',
    `**Packet:** ${packet.packetId}`,
    `**Tier:** ${packet.tier}`,
    `**Decision Status:** ${decision.status}`,
    `**Recommendation:** ${decision.finalRecommendation}`,
    `**Enforcement:** ${decision.enforcement}`,
    '',
    '### Escalation Reasons',
    ...formatReasons(packet),
    '',
    '### Requested Agents',
    ...formatAgents(decision),
    '',
    '> Quorum Preview is observational only. It does not execute agents, write to the ledger, or block merges.',
  ].join('\n');
}
