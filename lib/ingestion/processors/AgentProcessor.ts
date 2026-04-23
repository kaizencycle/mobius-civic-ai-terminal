import type { ProcessedAgentSignal } from '@/lib/ingestion/types';

type AgentStatus = {
  id: string;
  name: string;
  status?: string;
  lastSeen?: string;
  confidence?: number;
  voteParticipation?: number;
  dvaViolations?: unknown[];
  dvaWarnings?: unknown[];
  recentEvents?: Array<{ timestamp: string }>;
};

export class AgentProcessor {
  process(agentStatus: AgentStatus): ProcessedAgentSignal {
    return {
      agentId: agentStatus.id,
      name: agentStatus.name,
      healthScore: this.calculateHealth(agentStatus),
      consensusParticipation: agentStatus.voteParticipation ?? 0,
      constitutionalCompliance: this.checkDVACompliance(agentStatus),
      eventVelocity: this.calculateVelocity(agentStatus.recentEvents),
      integrityScore: agentStatus.confidence ?? 0.5,
    };
  }

  private calculateHealth(status: AgentStatus): number {
    const factors = {
      online: status.status === 'active' ? 1 : 0.5,
      responsive: status.lastSeen
        ? Date.now() - new Date(status.lastSeen).getTime() < 60_000
          ? 1
          : 0.5
        : 0,
      confident: status.confidence ?? 0.5,
    };

    return (factors.online + factors.responsive + factors.confident) / 3;
  }

  private checkDVACompliance(status: AgentStatus): 'compliant' | 'warning' | 'violation' {
    if ((status.dvaViolations?.length ?? 0) > 0) return 'violation';
    if ((status.dvaWarnings?.length ?? 0) > 0) return 'warning';

    return 'compliant';
  }

  private calculateVelocity(events?: Array<{ timestamp: string }>): 'high' | 'medium' | 'low' {
    if (!events?.length) return 'low';

    const oneHourAgo = Date.now() - 3_600_000;
    const recentCount = events.filter((event) => new Date(event.timestamp).getTime() > oneHourAgo).length;

    if (recentCount > 20) return 'high';
    if (recentCount > 5) return 'medium';

    return 'low';
  }
}
