'use client';

import { useCallback, useMemo } from 'react';
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
  fallback_reason?: string | null;
  current_cycle_entry_count?: number;
  savepoint?: {
    status: 'live' | 'saved' | 'none';
    saved_at: string | null;
    saved_count: number;
    live_count: number;
    reason: string | null;
  };
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
  id?: string;
  agent?: string;
  agentOrigin?: string;
  author?: string;
  source?: string;
  sourceAgent?: string;
  cycle?: string;
  category?: string;
  observation?: string;
  inference?: string;
  recommendation?: string;
  summary?: string;
  title?: string;
  body?: string;
  message?: string;
  timestamp?: string;
  status?: string;
  severity?: string;
  confidence?: number;
  derivedFrom?: string[];
  source_mode?: 'kv' | 'substrate';
  canonical_path?: string;
};

function normalizeAgentName(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveTierAgents(tier: DvaTier): string[] {
  if (tier === 'ALL') return [];
  return DVA_TIER_AGENTS[tier] ?? [];
}

function getPreviewEntryAgent(entry: unknown): string {
  const candidate = entry as PreviewJournalCandidate;
  return normalizeAgentName(candidate.agentOrigin) || normalizeAgentName(candidate.agent) || normalizeAgentName(candidate.sourceAgent) || normalizeAgentName(candidate.author) || normalizeAgentName(candidate.source);
}

function normalizePreviewStatus(value: unknown): 'draft' | 'committed' | 'contested' | 'verified' {
  const status = normalizeText(value).toLowerCase();
  if (status === 'draft' || status === 'contested' || status === 'verified') return status;
  return 'committed';
}

function normalizePreviewSeverity(value: unknown): 'nominal' | 'elevated' | 'critical' {
  const severity = normalizeText(value).toLowerCase();
  if (severity === 'critical') return 'critical';
  if (severity === 'elevated' || severity === 'high' || severity === 'medium') return 'elevated';
  return 'nominal';
}

function normalizePreviewEntry(entry: unknown, idx: number, fallbackTimestamp: string) {
  const candidate = entry as PreviewJournalCandidate;
  const agent = getPreviewEntryAgent(entry) || 'ECHO';
  const observation = normalizeText(candidate.observation) || normalizeText(candidate.summary) || normalizeText(candidate.title) || normalizeText(candidate.body) || normalizeText(candidate.message) || 'Preview journal row awaiting native observation payload.';
  const inference = normalizeText(candidate.inference) || normalizeText(candidate.recommendation) || 'Preview source did not include a separate inference field.';

  return {
    ...candidate,
    id: normalizeText(candidate.id) || `preview-${agent}-${idx}`,
    agent,
    agentOrigin: normalizeAgentName(candidate.agentOrigin) || agent,
    sourceAgent: normalizeAgentName(candidate.sourceAgent) || agent,
    cycle: normalizeText(candidate.cycle) || 'C-—',
    category: normalizeText(candidate.category) || 'observation',
    observation,
    inference,
    recommendation: normalizeText(candidate.recommendation),
    timestamp: normalizeText(candidate.timestamp) || fallbackTimestamp,
    source: normalizeText(candidate.source) || 'snapshot-preview',
    status: normalizePreviewStatus(candidate.status),
    severity: normalizePreviewSeverity(candidate.severity),
    confidence: typeof candidate.confidence === 'number' ? candidate.confidence : undefined,
    derivedFrom: Array.isArray(candidate.derivedFrom) ? candidate.derivedFrom : [],
    source_mode: candidate.source_mode,
    canonical_path: candidate.canonical_path,
  };
}

function entryBelongsToTier(entry: unknown, tierAgents: Set<string>): boolean {
  if (tierAgents.size === 0) return true;
  const agent = getPreviewEntryAgent(entry);
  return agent.length > 0 && tierAgents.has(agent);
}

export function useJournalChamber(enabled: boolean, mode: 'hot' | 'canon' | 'merged', limit = 250, tier: DvaTier = 'ALL', windowHours = 48) {
  const { snapshot } = useTerminalSnapshot();
  const { digest } = useEchoDigest(enabled);
  const stabilizationActive = digest?.predictive.risk_level === 'elevated' || digest?.predictive.risk_level === 'critical';
  const safeLimit = Math.max(1, Math.min(250, Math.floor(limit)));
  const safeWindowHours = Math.max(1, Math.min(72, Math.floor(windowHours)));
  const tierAgentsList = useMemo(() => resolveTierAgents(tier), [tier]);
  const getSavepointCount = useCallback((payload: JournalChamberPayload) => Array.isArray(payload.entries) ? payload.entries.length : 0, []);
  const url = useMemo(() => {
    const params = new URLSearchParams({ mode, limit: String(safeLimit), window_hours: String(safeWindowHours) });
    params.set('tier', tier);
    for (const agent of tierAgentsList) params.append('agent', agent);
    return `/api/chambers/journal?${params.toString()}`;
  }, [mode, safeLimit, safeWindowHours, tier, tierAgentsList]);

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
    const scopedEntries = latestEntries.filter((entry) => entryBelongsToTier(entry, tierAgents)).map((entry, idx) => normalizePreviewEntry(entry, idx, timestamp));

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
    pollMs: 90_000,
    savepointKey: `journal:${mode}:${tier}:${safeLimit}:${safeWindowHours}h:${tierAgentsList.join(',')}`,
    getSavepointCount,
  });
}
