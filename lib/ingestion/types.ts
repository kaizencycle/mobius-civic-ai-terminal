export type DataSourceType = 'rest' | 'sse' | 'websocket' | 'poll';

export type SignalType =
  | 'epicon'
  | 'agent'
  | 'integrity'
  | 'threat'
  | 'consensus'
  | 'economy'
  | 'sentiment'
  | 'constitutional';

export interface DataSourceConfig {
  name: string;
  baseUrl: string;
  type: DataSourceType;
  auth?: {
    type: 'bearer' | 'apikey' | 'none';
    token?: string;
  };
  retryConfig: {
    maxRetries: number;
    backoffMs: number;
  };
}

export interface IntegritySignal {
  sourceReliability: number;
  institutionalTrust: number;
  consensusStability: number;
  narrativeDivergence: number;
  giContribution: number;
  provenance: {
    source: string;
    timestamp: Date;
    rawHash: string;
  };
}

export interface IngestedSignal {
  id: string;
  timestamp: Date;
  source: string;
  type: SignalType;
  raw: unknown;
  processed: IntegritySignal;
  confidence: number;
}

export interface ThreatIndicator {
  type: 'manipulation' | 'source_risk' | 'other';
  severity: 'low' | 'medium' | 'high';
  reason: string;
}

export interface SentimentAnalysis {
  polarity: 'positive' | 'negative' | 'neutral';
  intensity: 'high' | 'low';
  subjectivity: 'high' | 'low';
}

export interface ProcessedEPICON {
  id: string;
  timestamp: Date;
  confidenceTier: 'unverified' | 'low' | 'medium' | 'high' | 'confirmed';
  sourceChain?: string[];
  agentTrace?: string[];
  verificationStatus: 'verified' | 'questionable' | 'contradicted';
  threatIndicators: ThreatIndicator[];
  sentiment: SentimentAnalysis;
  giDelta: number;
}

export interface ProcessedAgentSignal {
  agentId: string;
  name: string;
  healthScore: number;
  consensusParticipation: number;
  constitutionalCompliance: 'compliant' | 'warning' | 'violation';
  eventVelocity: 'high' | 'medium' | 'low';
  integrityScore: number;
}
