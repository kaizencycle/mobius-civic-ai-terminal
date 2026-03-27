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
  zeusVerdict?: string;
  patternType?: string;
  dominantRegion?: string;
};
