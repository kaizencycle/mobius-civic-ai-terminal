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

function normalizeFeedItem(raw: Record<string, unknown>): EpiconEvent | null {
  const id = typeof raw.id === 'string' ? raw.id : null;
  const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : null;
  const title = typeof raw.title === 'string' ? raw.title : null;
  if (!id || !timestamp || !title) return null;

  const ts = new Date(timestamp).getTime();
  if (!Number.isFinite(ts)) return null;

  const verified = Boolean(raw.verified);
  const status = raw.status;
  const tier: ConfidenceTier =
    verified || status === 'committed' ? 'VERIFIED' :
    status === 'failed' ? 'CONTRADICTED' :
    'PENDING';

  const confRaw = raw.confidenceTier;
  const confidence =
    typeof confRaw === 'number' && confRaw >= 0 && confRaw <= 4
      ? confRaw / 4
      : verified ? 0.8 : 0.5;

  const summary =
    typeof raw.body === 'string' && raw.body.trim() ? raw.body :
    typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary :
    title;

  const agent =
    typeof raw.agentOrigin === 'string' && raw.agentOrigin.trim()
      ? raw.agentOrigin.toUpperCase()
      : typeof raw.author === 'string' && raw.author.trim()
        ? raw.author.toUpperCase()
        : 'SYSTEM';

  const cycle =
    typeof raw.cycleId === 'string' && raw.cycleId ? raw.cycleId :
    typeof raw.cycle === 'string' && raw.cycle ? raw.cycle :
    'C-—';

  const sourcesRaw = raw.sources ?? raw.tags;
  const sources: string[] = Array.isArray(sourcesRaw)
    ? (sourcesRaw as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  return { id, cycle, ts, tier, label: title, summary, agent, confidence, sources };
}

export async function fetchEpiconEvents(): Promise<EpiconEvent[]> {
  const raw = await fetchInternal('/api/epicon/feed');
  if (raw && typeof raw === 'object') {
    const items = (raw as { items?: unknown }).items;
    if (Array.isArray(items) && items.length > 0) {
      const normalized = (items as Record<string, unknown>[])
        .map(normalizeFeedItem)
        .filter((e): e is EpiconEvent => e !== null);
      if (normalized.length > 0) return normalized;
    }
  }
  return MOCK_EPICON_EVENTS;
}
