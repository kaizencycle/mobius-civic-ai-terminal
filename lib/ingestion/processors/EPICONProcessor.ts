import type {
  ProcessedEPICON,
  SentimentAnalysis,
  ThreatIndicator,
} from '@/lib/ingestion/types';

type EPICONEvent = {
  id: string;
  timestamp: string;
  confidenceScore?: number;
  sourceChain?: string[];
  agentTrace?: string[];
  content?: unknown;
};

export class EPICONProcessor {
  process(event: EPICONEvent): ProcessedEPICON {
    return {
      id: event.id,
      timestamp: new Date(event.timestamp),
      confidenceTier: this.calculateConfidenceTier(event.confidenceScore ?? 0.5),
      sourceChain: event.sourceChain,
      agentTrace: event.agentTrace,
      verificationStatus: this.verifyProvenance(event),
      threatIndicators: this.extractThreats(event),
      sentiment: this.analyzeSentiment(event.content),
      giDelta: this.calculateGIDelta(event),
    };
  }

  private calculateConfidenceTier(score: number): 'unverified' | 'low' | 'medium' | 'high' | 'confirmed' {
    if (score > 0.95) return 'confirmed';
    if (score > 0.8) return 'high';
    if (score > 0.6) return 'medium';
    if (score > 0.4) return 'low';

    return 'unverified';
  }

  private verifyProvenance(event: EPICONEvent): 'verified' | 'questionable' | 'contradicted' {
    const hasValidChain = Boolean(event.sourceChain && event.sourceChain.length > 0);
    const hasAgentConsensus = Boolean(event.agentTrace && event.agentTrace.length >= 2);

    if (hasValidChain && hasAgentConsensus) return 'verified';
    if (hasValidChain || hasAgentConsensus) return 'questionable';

    return 'contradicted';
  }

  private extractThreats(event: EPICONEvent): ThreatIndicator[] {
    const threats: ThreatIndicator[] = [];
    const contentText = JSON.stringify(event.content ?? '').toLowerCase();

    if (contentText.includes('urgent') && (event.confidenceScore ?? 0) < 0.5) {
      threats.push({ type: 'manipulation', severity: 'medium', reason: 'Low-confidence urgency pattern' });
    }

    if (event.sourceChain?.some((source) => source.includes('unverified'))) {
      threats.push({ type: 'source_risk', severity: 'high', reason: 'Unverified source in chain' });
    }

    return threats;
  }

  private analyzeSentiment(content: unknown): SentimentAnalysis {
    const text = JSON.stringify(content ?? '').toLowerCase();
    const positive = ['good', 'great', 'excellent', 'success', 'verified'].some((word) => text.includes(word));
    const negative = ['bad', 'fail', 'error', 'contradicted', 'false'].some((word) => text.includes(word));

    return {
      polarity: positive ? 'positive' : negative ? 'negative' : 'neutral',
      intensity: positive || negative ? 'high' : 'low',
      subjectivity: text.includes('i think') || text.includes('believe') ? 'high' : 'low',
    };
  }

  private calculateGIDelta(event: EPICONEvent): number {
    const baseImpact = event.confidenceScore ?? 0.5;
    const sourceMultiplier = event.sourceChain?.length
      ? Math.min(event.sourceChain.length * 0.1, 0.5)
      : 0;

    return baseImpact * 0.1 + sourceMultiplier;
  }
}
