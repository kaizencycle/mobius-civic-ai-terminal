/**
 * Sentinel + steward scheduled journal writes after EVE cycle synthesis (C-280+).
 */

import { appendAgentJournalEntry } from '@/lib/agents/journal';
import { loadEchoState, loadSignalSnapshot } from '@/lib/kv/store';
import { writeMiiState } from '@/lib/kv/mii';
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

async function writeMiiForEntry(entry: AgentJournalEntry, gi: number): Promise<void> {
  try {
    await writeMiiState({
      agent: entry.agent,
      mii: Number(entry.confidence.toFixed(4)),
      gi,
      cycle: entry.cycle,
      timestamp: new Date().toISOString(),
      source: 'live',
    });
  } catch (err) {
    console.error(`[steward-journal] mii write failed for ${entry.agent}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * HERMES, AUREA, JADE, DAEDALUS, ECHO — one committed journal per cycle after ATLAS/ZEUS/EVE path runs.
 */
export async function appendStewardCronJournals(input: {
  cycle: string;
  gi: number;
  source: CronSentinelSource;
  zeusJournalId?: string | null;
}): Promise<AgentJournalEntry[]> {
  const gi = clampGi(input.gi);
  const { count, labels } = await summarizeMicroAnomalies();
  const labelShort = labels.slice(0, 5).join('; ') || 'No elevated micro-agent lines in snapshot.';
  const has401 = labels.some((l) => /401|self-ping/i.test(l));
  const echo = await loadEchoState().catch(() => null);
  const zeusRef = input.zeusJournalId?.trim() || 'pending';

  const written: AgentJournalEntry[] = [];

  const appendOne = async (fn: () => Promise<AgentJournalEntry>, agent: string) => {
    try {
      const entry = await fn();
      await writeMiiForEntry(entry, gi);
      written.push(entry);
    } catch (err) {
      console.error(`[steward-journal] ${agent} append failed:`, err instanceof Error ? err.message : err);
    }
  };

  await appendOne(
    () =>
      appendAgentJournalEntry({
    agent: 'HERMES',
    cycle: input.cycle,
    observation: `HERMES routing & priority sweep (${input.source}) for ${input.cycle}. Elevated micro signals: ${count}.`,
    inference: `Active routing context: ${labelShort}`,
    recommendation: 'Keep HERMES-µ narrative lane distinct from ECHO financial EPICONs; refresh feeds before staleness thresholds.',
    confidence: Number((0.82 + gi * 0.06).toFixed(4)),
    derivedFrom: ['signal-snapshot:kv', `zeus-journal:${zeusRef}`, `source:${input.source}`],
    relatedAgents: ['ATLAS', 'ZEUS', 'EVE'],
    status: 'committed',
    category: 'observation',
    severity: count > 5 ? 'elevated' : 'nominal',
      }),
    'HERMES',
  );

  await appendOne(
    () =>
      appendAgentJournalEntry({
    agent: 'AUREA',
    cycle: input.cycle,
    observation: `AUREA strategic synthesis read (${input.source}) for ${input.cycle} after sentinel council journal pass.`,
    inference: `GI ${gi.toFixed(2)} — consolidate governance posture with pending ledger promotions and ZEUS verification queue.`,
    recommendation: 'Review multi-cycle trends at daily close; surface divergences between civic narrative and institutional lanes.',
    confidence: Number((0.84 + gi * 0.05).toFixed(4)),
    derivedFrom: ['sentinel-council:synthesis', `cycle:${input.cycle}`, `source:${input.source}`],
    relatedAgents: ['ATLAS', 'EVE', 'JADE'],
    status: 'committed',
    category: 'inference',
    severity: 'nominal',
      }),
    'AUREA',
  );

  await appendOne(
    () =>
      appendAgentJournalEntry({
    agent: 'JADE',
    cycle: input.cycle,
    observation: `JADE constitutional annotation pass (${input.source}) for ${input.cycle}.`,
    inference: 'Verify operator-visible provenance on promotable EPICONs matches covenant routing and agent ownership.',
    recommendation: 'Flag novel precedents where civic-risk and governance categories overlap without explicit ZEUS attestation.',
    confidence: Number((0.8 + gi * 0.06).toFixed(4)),
    derivedFrom: ['constitutional:frame', `eve-synthesis:${input.cycle}`, `source:${input.source}`],
    relatedAgents: ['ZEUS', 'AUREA'],
    status: 'committed',
    category: 'observation',
    severity: 'nominal',
      }),
    'JADE',
  );

  await appendOne(
    () =>
      appendAgentJournalEntry({
    agent: 'DAEDALUS',
    cycle: input.cycle,
    observation: `DAEDALUS infrastructure diagnostic (${input.source}) for ${input.cycle}.`,
    inference: has401
      ? 'DAEDALUS self-ping reports HTTP 401 in micro sweep — known protected-endpoint behavior; do not treat as KV or ledger outage.'
      : 'Build and connectivity surface nominal from micro snapshot context.',
    recommendation: 'Monitor KV REST latency and deployment SHA; preserve auth on self-ping until dedicated health probe exists.',
    confidence: Number((0.78 + gi * 0.08).toFixed(4)),
    derivedFrom: ['infra:micro-sweep', `source:${input.source}`],
    relatedAgents: ['HERMES', 'ECHO'],
    status: 'committed',
    category: 'observation',
    severity: has401 ? 'elevated' : 'nominal',
      }),
    'DAEDALUS',
  );

  const echoObs = echo
    ? `ECHO KV lane summary (${input.source}): healthy=${echo.healthy}, epicon≈${echo.epiconCount}, ledger≈${echo.ledgerCount}, dedup≈${echo.dedupRate != null ? echo.dedupRate.toFixed(3) : 'n/a'}.`
    : `ECHO ingestion check (${input.source}): echo:state not readable this pass.`;
  const echoInf = echo
    ? 'Ingestion coherence tracked via ECHO_STATE; align duplicate rate with operator expectations before broad promotion.'
    : 'ECHO store summary unavailable — rely on /api/echo/feed freshness until next ingest.';

  await appendOne(
    () =>
      appendAgentJournalEntry({
        agent: 'ECHO',
        cycle: input.cycle,
        observation: echoObs,
        inference: echoInf,
        recommendation: 'Trigger /api/echo/ingest if feed stale; keep epicon:feed LPUSH path on successful rated batches.',
        confidence: Number((0.83 + gi * 0.05).toFixed(4)),
        derivedFrom: ['echo:kv-state', `cycle:${input.cycle}`, `source:${input.source}`],
        relatedAgents: ['HERMES', 'DAEDALUS'],
        status: 'committed',
        category: 'observation',
        severity: echo && !echo.healthy ? 'elevated' : 'nominal',
      }),
    'ECHO',
  );

  return written;
}
