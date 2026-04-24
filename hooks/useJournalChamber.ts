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
};

export type DvaTier = 'ALL' | 't1' | 't2' | 't3' | 'sentinel' | 'architects';

const DVA_TIER_AGENTS: Record<Exclude<DvaTier, 'ALL'>, string[]> = {
  t1: ['ECHO'],
  t2: ['ATLAS', 'ZEUS'],
  t3: ['EVE', 'JADE', 'HERMES'],
  sentinel: ['ATLAS', 'ZEUS', 'EVE'],
  architects: ['AUREA', 'DAEDALUS'],
};

function resolveTierAgents(tier: DvaTier): string[] {
  if (tier === 'ALL') return [];
  return DVA_TIER_AGENTS[tier] ?? [];
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
  const url = useMemo(() => {
    const params = new URLSearchParams({ mode, limit: String(limit) });
    params.set('tier', tier);
    for (const agent of resolveTierAgents(tier)) {
      params.append('agent', agent);
    }
    return `/api/chambers/journal?${params.toString()}`;
  }, [mode, limit, tier]);

  const preview = useMemo(() => {
    const summary = snapshot?.journal_summary;
    const latest = (summary as { latest_agent_entries?: unknown[] } | undefined)?.latest_agent_entries;
    const digestEntries = (digest?.journal_preview.cycles ?? []).map((bucket) => ({
      id: `digest-${bucket.cycle}`,
      cycle: bucket.cycle,
      observation: `Digest cycle bucket · ${bucket.count} entries`,
      timestamp: digest?.timestamp ?? new Date().toISOString(),
      source: 'echo-digest',
    }));

    const latestEntries = Array.isArray(latest) ? latest : digestEntries;
    const tierAgents = new Set(resolveTierAgents(tier));
    const scopedEntries = tierAgents.size === 0
      ? latestEntries
      : latestEntries.filter((entry) => {
          const candidate = entry as { agent?: string; agentOrigin?: string };
          const agent = (candidate.agentOrigin ?? candidate.agent ?? '').toUpperCase();
          return agent.length > 0 ? tierAgents.has(agent) : true;
        });

    return {
      ok: true,
      mode,
      entries: scopedEntries,
      canonical_available: false,
      fallback: true,
      timestamp: digest?.timestamp ?? snapshot?.timestamp ?? new Date().toISOString(),
    } satisfies JournalChamberPayload;
  }, [mode, snapshot, digest, tier]);

  return useChamberHydration<JournalChamberPayload>(url, enabled, {
    previewData: preview,
    lockToPreview: stabilizationActive,
  });
}
