/**
 * Shared shape for EPICON entries read from Redis or in-memory ledger (C-626).
 */

export type EpiconLedgerFeedEntry = {
  id: string;
  timestamp: string;
  author: string;
  title: string;
  body?: string;
  type: string;
  severity: 'nominal' | 'degraded' | 'elevated' | 'critical' | 'info' | 'low' | 'medium' | 'high';
  gi?: number | null;
  tags: string[];
  source: string;
  verified: boolean;
  verifiedBy?: string;
  cycle?: string;
  category?: string;
  confidenceTier?: number;
  derivedFrom?: string;
  /** Structured provenance (EPICON IDs, civic:alertId, etc.) when the row supports it. */
  derivedFromIds?: string[];
  status?: 'committed' | 'pending' | 'failed';
  agentOrigin?: string;
  zeusVerdict?: string;
  patternType?: string;
  dominantRegion?: string;
};
