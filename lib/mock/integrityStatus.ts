import type { GIMode } from '@/lib/gi/mode';

export type IntegritySignals = {
  quality: number;
  freshness: number;
  stability: number;
  system: number;
  geopolitics: number;
  economy: number;
  sentiment: number;
  information: number;
};

export type IntegrityStatusResponse = {
  ok: true;
  cycle: string;
  timestamp: string;
  global_integrity: number;
  mode: GIMode;
  mii_baseline: number;
  mic_supply: number;
  terminal_status: 'nominal' | 'stressed' | 'critical';
  primary_driver: string;
  summary: string;
  signals: IntegritySignals;
  /** C-287 — GI read provenance from `/api/integrity-status` */
  gi_provenance?: string | null;
  gi_verified?: boolean;
  gi_degraded?: boolean;
  gi_age_seconds?: number | null;
  degraded?: boolean;
  mic_readiness_snapshot_source?: string;
};

export const integrityStatus: IntegrityStatusResponse = {
  ok: true,
  cycle: 'C-258',
  timestamp: '2026-03-22T11:34:00Z',
  global_integrity: 0.78,
  mode: 'yellow',
  mii_baseline: 0.5,
  mic_supply: 1000000,
  terminal_status: 'stressed',
  primary_driver: 'Middle East energy instability',
  summary:
    'GI reflects signal quality, freshness, tripwire stability, and active system health.',
  signals: {
    quality: 0.8,
    freshness: 0.6,
    stability: 0.72,
    system: 1,
    geopolitics: 0.8,
    economy: 1,
    sentiment: 0.72,
    information: 0.6,
  },
};
