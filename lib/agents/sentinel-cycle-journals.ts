/**
 * ATLAS / ZEUS scheduled journal writes after EVE cycle synthesis (C-280).
 */

import { appendAgentJournalEntry } from '@/lib/agents/journal';
import { loadSignalSnapshot } from '@/lib/kv/store';
import type { AgentJournalEntry } from '@/lib/terminal/types';

export type CronSentinelSource = 'cron' | 'post-eve-synthesis';

export type AtlasObserveInput = {
  cycle: string;
  gi: number;
  source: CronSentinelSource;
};

export type ZeusVerifyCronInput = {
  cycle: string;
  gi: number;
  atlasEntry?: string | null;
  source: CronSentinelSource;
};

function clampGi(n: number): number {
  if (!Number.isFinite(n)) return 0.74;
  return Math.max(0, Math.min(1, n));
}

export async function summarizeMicroAnomalies(): Promise<{ count: number; labels: string[] }> {
  const snap = await loadSignalSnapshot();
  if (!snap?.allSignals?.length) {
    return { count: typeof snap?.anomalies === 'number' ? snap.anomalies : 0, labels: [] };
  }
  const hot = snap.allSignals.filter((s) => {
    const sev = String(s.severity).toLowerCase();
    return sev === 'critical' || sev === 'elevated' || sev === 'watch';
  });
  const count = typeof snap.anomalies === 'number' ? snap.anomalies : hot.length;
  const labels = hot.slice(0, 6).map((s) => `${s.agentName}: ${s.label}`);
  return { count, labels };
}

export async function appendAtlasCronJournal(input: AtlasObserveInput): Promise<AgentJournalEntry> {
  const { count, labels } = await summarizeMicroAnomalies();
  const gi = clampGi(input.gi);
  const labelText = labels.length > 0 ? labels.join('; ') : 'No elevated micro-agent anomalies in cached signal snapshot.';

  return appendAgentJournalEntry({
    agent: 'ATLAS',
    cycle: input.cycle,
    observation: `ATLAS cycle observation (${input.source}) for ${input.cycle}. Micro snapshot anomalies: ${count}.`,
    inference: `Signal surface review complete. ${labelText}`,
    recommendation:
      count > 0
        ? 'Prioritize corroboration on flagged micro-agent lanes and ensure ZEUS verification queue stays current.'
        : 'Maintain standard verification cadence; continue monitoring governance synthesis outputs.',
    confidence: Number((0.88 + gi * 0.08).toFixed(4)),
    derivedFrom: ['signal-snapshot:kv', `eve-synthesis:${input.cycle}`, `source:${input.source}`],
    relatedAgents: ['EVE', 'ZEUS'],
    status: 'committed',
    category: 'observation',
    severity: count > 4 ? 'elevated' : 'nominal',
  });
}

export async function appendZeusCronJournal(input: ZeusVerifyCronInput): Promise<AgentJournalEntry> {
  const gi = clampGi(input.gi);
  const atlasRef = input.atlasEntry?.trim() ? input.atlasEntry.trim() : 'pending';

  return appendAgentJournalEntry({
    agent: 'ZEUS',
    cycle: input.cycle,
    observation: `ZEUS verification pass (${input.source}) after EVE cycle synthesis for ${input.cycle}. ATLAS journal reference: ${atlasRef}.`,
    inference:
      gi >= 0.72
        ? 'Global integrity within operational band; governance synthesis and ledger commits may proceed under standard gates.'
        : 'Global integrity stressed; tighten promotion gates and require explicit ATLAS review on contested EPICONs.',
    recommendation:
      'Continue ledger attestation with AGENT_SERVICE_TOKEN present; escalate contested rows before broad promotion.',
    confidence: Number((0.85 + gi * 0.06).toFixed(4)),
    derivedFrom: ['eve-synthesis:verify', `atlas-journal:${atlasRef}`, `source:${input.source}`],
    relatedAgents: ['EVE', 'ATLAS'],
    status: 'committed',
    category: 'inference',
    severity: gi < 0.72 ? 'elevated' : 'nominal',
    verifiedBy: 'ZEUS',
  });
}

export function parseAtlasObserveBody(body: unknown): AtlasObserveInput | null {
  if (body === null || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const cycle = typeof o.cycle === 'string' && o.cycle.trim() ? o.cycle.trim() : null;
  const giRaw = o.gi;
  const gi = typeof giRaw === 'number' && Number.isFinite(giRaw) ? giRaw : 0.74;
  const sourceRaw = o.source;
  const source: CronSentinelSource = sourceRaw === 'cron' ? 'cron' : 'post-eve-synthesis';
  if (!cycle) return null;
  return { cycle, gi, source };
}

export function parseZeusCronBody(body: unknown): ZeusVerifyCronInput | null {
  if (body === null || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const cycle = typeof o.cycle === 'string' && o.cycle.trim() ? o.cycle.trim() : null;
  const giRaw = o.gi;
  const gi = typeof giRaw === 'number' && Number.isFinite(giRaw) ? giRaw : 0.74;
  const atlasEntry = typeof o.atlasEntry === 'string' ? o.atlasEntry : null;
  const sourceRaw = o.source;
  const source: CronSentinelSource = sourceRaw === 'cron' ? 'cron' : 'post-eve-synthesis';
  if (!cycle) return null;
  return { cycle, gi, atlasEntry, source };
}

