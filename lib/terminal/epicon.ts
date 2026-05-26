/**
 * Phase 02 (C-323): EPICON event feed data layer with mock events seeded
 * from live scan — ZEUS inconclusive C-323, EU AI Act investigation, G7 renewal.
 */

import { fetchInternal } from './api-client';

export type ConfidenceTier = 'VERIFIED' | 'PENDING' | 'CONTRADICTED' | 'ARCHIVED';

export interface EpiconEvent {
  id: string;
  cycle: string;
  ts: number;
  tier: ConfidenceTier;
  label: string;
  summary: string;
  agent: string;
  confidence: number;
  sources: string[];
  contradictions?: string[];
}

export const MOCK_EPICON_EVENTS: EpiconEvent[] = [
  {
    id: 'ep-001',
    cycle: 'C-323',
    ts: Date.now() - 1_800_000,
    tier: 'VERIFIED',
    label: 'US Senate AI Safety Hearing — markup session concluded',
    summary:
      'Senate Commerce Committee approved S.1847 markup with 3 amendments. ATLAS confidence 0.92 after ZEUS cross-verification.',
    agent: 'ATLAS',
    confidence: 0.92,
    sources: ['reuters.com', 'congress.gov', 'politico.com'],
  },
  {
    id: 'ep-002',
    cycle: 'C-323',
    ts: Date.now() - 3_600_000,
    tier: 'PENDING',
    label: 'EU AI Act enforcement — first Article 53 investigation opened',
    summary:
      'Reports of first formal investigation under Article 53 general-purpose AI rules. Single source, not yet cross-verified.',
    agent: 'EVE',
    confidence: 0.61,
    sources: ['euractiv.com'],
  },
  {
    id: 'ep-003',
    cycle: 'C-322',
    ts: Date.now() - 28_800_000,
    tier: 'CONTRADICTED',
    label: 'OpenAI AGI threshold declaration — disputed',
    summary:
      'Initial reports of internal AGI threshold declaration contradicted by official OpenAI communications. ZEUS flagged divergence.',
    agent: 'ZEUS',
    confidence: 0.28,
    sources: ['techcrunch.com', 'theinformation.com'],
    contradictions: ['openai.com/blog', 'Reuters correction C-322'],
  },
  {
    id: 'ep-004',
    cycle: 'C-321',
    ts: Date.now() - 86_400_000,
    tier: 'VERIFIED',
    label: 'G7 AI governance communiqué — Hiroshima Process renewal signed',
    summary:
      'All G7 members signed renewed Hiroshima Process AI governance framework. JADE integrity score 0.94.',
    agent: 'JADE',
    confidence: 0.94,
    sources: ['g7.gc.ca', 'state.gov', 'consilium.europa.eu'],
  },
];

export async function fetchEpiconEvents(): Promise<EpiconEvent[]> {
  const raw = await fetchInternal('/api/epicon/feed');
  if (raw && typeof raw === 'object') {
    const items = (raw as { items?: unknown }).items;
    if (Array.isArray(items) && items.length > 0) {
      return items as EpiconEvent[];
    }
  }
  return MOCK_EPICON_EVENTS;
}
