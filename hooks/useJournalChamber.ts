'use client';

import { useMemo } from 'react';
import { useChamberHydration } from '@/hooks/useChamberHydration';
import { useEchoDigest } from '@/hooks/useEchoDigest';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

export type JournalChamberPayload = {
  ok: boolean;
  mode: 'hot' | 'canon' | 'merged';
  entries: unknown[];
  canonical_available: boolean;
  fallback: boolean;
  timestamp: string;
  tier?: DvaTier;
  tier_agents?: string[];
  scoped?: boolean;
};

export type DvaTier = 'ALL' | 't1' | 't2' | 't3' | 'sentinel' | 'architects';

const DVA_TIER_AGENTS: Record<Exclude<DvaTier, 'ALL'>, string[]> = {
  t1: ['ECHO'],
  t2: ['ATLAS', 'ZEUS'],
  t3: ['EVE', 'JADE', 'HERMES'],
  sentinel: ['ATLAS', 'ZEUS', 'EVE'],
  architects: ['AUREA', 'DAEDALUS'],
};

type PreviewJournalCandidate = {
  agent?: string;
  agentOrigin?: string;
  author?: string;
  source?: string;
  sourceAgent?: string;
};

function normalizeAgentName(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function resolveTierAgents(tier: DvaTier): string[] {
  if (tier === 'ALL') return [];
  return DVA_TIER_AGENTS[tier] ?? [];
}

function getPreviewEntryAgent(entry: unknown): string {
  const candidate = entry as PreviewJournalCandidate;
  return (
    normalizeAgentName(candidate.agentOrigin) ||
    normalizeAgentName(candidate.agent) ||
    normalizeAgentName(candidate.sourceAgent) ||
    normalizeAgentName(candidate.author) ||
    normalizeAgentName(candidate.source)
  );
}

function entryBelongsToTier(entry: unknown, tierAgents: Set<string>): boolean {
  if (tierAgents.size === 0) return true;
  const agent = getPreviewEntryAgent(entry);
  // C-291 fix: unscoped preview rows must not bypass a non-ALL tier filter.
  // If a fallback/digest row cannot prove an agent origin, it is excluded until
  // the live chamber response returns canonical scoping metadata.
  return agent.length > 0 && tierAgents.has(agent);
}

export function useJournalChamber(
  enabled: boolean,
  mode: 'hot' | 'canon' | 'merged',
  limit = 100,
  tier: DvaTier = 'ALL',
) {
  const { snapshot } = useTerminalSnapshot();
  const { digest } = useEchoDigest(enabled);
  const stabilizationActive = digest?.predictive.risk_level === 'elevated' || digest?.predictive.risk_level === 'critical';
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const tierAgentsList = useMemo(() => resolveTierAgents(tier), [tier]);
  const url = useMemo(() => {
    const params = new URLSearchParams({ mode, limit: String(safeLimit) });
    params.set('tier', tier);
    for (const agent of tierAgentsList) {
      params.append('agent', agent);
    }
    return `/api/chambers/journal?${params.toString()}`;
  }, [mode, safeLimit, tier, tierAgentsList]);

  const preview = useMemo(() => {
    const summary = snapshot?.journal_summary;
    const latest = (summary as { latest_agent_entries?: unknown[] } | undefined)?.latest_agent_entries;
    const timestamp = digest?.timestamp ?? snapshot?.timestamp ?? new Date().toISOString();
    const digestEntries = (digest?.journal_preview.cycles ?? []).map((bucket) => ({
      id: `digest-${bucket.cycle}`,
      agent: 'ECHO',
      agentOrigin: 'ECHO',
      sourceAgent: 'ECHO',
      cycle: bucket.cycle,
      category: 'observation',
      observation: `Digest cycle bucket · ${bucket.count} entries`,
      inference: 'Digest fallback row generated from ECHO preview telemetry.',
      recommendation: 'Hydrate native journal rows before treating preview counts as canonical.',
      timestamp,
      source: 'echo-digest',
      status: 'draft',
      severity: 'nominal',
    }));

    const latestEntries = Array.isArray(latest) ? latest : digestEntries;
    const tierAgents = new Set(tierAgentsList);
    const scopedEntries = latestEntries.filter((entry) => entryBelongsToTier(entry, tierAgents));

    return {
      ok: true,
      mode,
      entries: scopedEntries,
      canonical_available: false,
      fallback: true,
      timestamp,
      tier,
      tier_agents: tierAgentsList,
      scoped: tier !== 'ALL',
    } satisfies JournalChamberPayload;
  }, [mode, snapshot, digest, tier, tierAgentsList]);

  return useChamberHydration<JournalChamberPayload>(url, enabled, {
    previewData: preview,
    lockToPreview: stabilizationActive,
  });
}
