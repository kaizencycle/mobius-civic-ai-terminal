import { NextResponse } from 'next/server';
import { mockAgentStatus } from '@/lib/mock-data';
import { KV_KEYS, kvGet } from '@/lib/kv/store';
import {
  isFresh,
  liveEnvelope,
  mockEnvelope,
  staleCacheEnvelope,
} from '@/lib/response-envelope';
import { readAgentJournals } from '@/lib/substrate/github-reader';
import type { SubstrateJournalEntry } from '@/lib/substrate/github-journal';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type HeartbeatPayload = {
  ok?: boolean;
  timestamp?: string;
  cycle?: string;
  cycleId?: string;
  agents?: Array<{ id?: string; status?: string; last_action?: string }>;
};

type GiStatePayload = {
  cycle?: string;
  cycleId?: string;
};

type LivenessState = 'DECLARED' | 'BOOTING' | 'ACTIVE' | 'DEGRADED' | 'OFFLINE' | 'CONTESTED';

const AGENT_BASE = [
  { id: 'atlas', name: 'ATLAS', role: 'System Integrity Sentinel', tier: 'Sentinel', color: 'cerulean', lane: 'integrity', scope: 'Anomaly and integrity scans' },
  { id: 'zeus', name: 'ZEUS', role: 'Verification Authority', tier: 'Sentinel', color: 'gold', lane: 'integrity', scope: 'Verification and contested claims' },
  { id: 'hermes', name: 'HERMES', role: 'Signal Routing & Prioritization', tier: 'Steward', color: 'coral', lane: 'routing', scope: 'Routing and transport actions' },
  { id: 'aurea', name: 'AUREA', role: 'Strategic Synthesis', tier: 'Architect', color: 'amber', lane: 'synthesis', scope: 'Synthesis and strategy events' },
  { id: 'jade', name: 'JADE', role: 'Constitutional Annotation', tier: 'Architect', color: 'jade', lane: 'annotation', scope: 'Annotation and morale contributions' },
  { id: 'daedalus', name: 'DAEDALUS', role: 'Infrastructure Health', tier: 'Architect', color: 'bronze', lane: 'infrastructure', scope: 'Build and research artifacts' },
  { id: 'echo', name: 'ECHO', role: 'Event Memory & Ingestion', tier: 'Steward', color: 'silver', lane: 'ingest', scope: 'Ingest and ledger-facing events' },
  { id: 'eve', name: 'EVE', role: 'Governance & Ethics Observer', tier: 'Observer', color: 'rose', lane: 'governance', scope: 'Ethics and governance review' },
] as const;

let staleSnapshot: { cycle: string; timestamp: string } | null = null;

const HEARTBEAT_FRESH_MS = Number(process.env.AGENT_HEARTBEAT_FRESH_MS ?? 300000);
const ACTION_FRESH_MS = Number(process.env.AGENT_ACTION_FRESH_MS ?? 900000);
const JOURNAL_FRESH_MS = Number(process.env.AGENT_JOURNAL_FRESH_MS ?? 3600000);
const OFFLINE_AFTER_MS = Number(process.env.AGENT_OFFLINE_AFTER_MS ?? 7200000);

function parseHeartbeat(rawHeartbeat: HeartbeatPayload | string | null): HeartbeatPayload | null {
  if (!rawHeartbeat) return null;
  if (typeof rawHeartbeat !== 'string') return rawHeartbeat;

  try {
    return JSON.parse(rawHeartbeat) as HeartbeatPayload;
  } catch {
    return null;
  }
}

function ageMs(iso?: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Date.now() - t;
}

function isWithin(ms: number, threshold: number): boolean {
  return Number.isFinite(ms) && ms <= threshold;
}

function deriveLiveness(input: {
  lastSeen?: string;
  lastActionAt?: string;
  lastJournalAt?: string;
  confidence: number;
  contested?: boolean;
}): LivenessState {
  if (input.contested) return 'CONTESTED';

  const hbAge = ageMs(input.lastSeen);
  const actionAge = ageMs(input.lastActionAt);
  const journalAge = ageMs(input.lastJournalAt);

  const hbFresh = isWithin(hbAge, HEARTBEAT_FRESH_MS);
  const actionFresh = isWithin(actionAge, ACTION_FRESH_MS);
  const journalFresh = isWithin(journalAge, JOURNAL_FRESH_MS);

  if (hbFresh && actionFresh && journalFresh && input.confidence >= 0.6) return 'ACTIVE';

  const noHeartbeat = !Number.isFinite(hbAge) || hbAge > OFFLINE_AFTER_MS;
  const noAction = !Number.isFinite(actionAge) || actionAge > OFFLINE_AFTER_MS;
  const noJournal = !Number.isFinite(journalAge) || journalAge > OFFLINE_AFTER_MS;
  if (noHeartbeat && noAction && noJournal) return 'OFFLINE';

  if (hbFresh && (!actionFresh || !journalFresh)) return 'BOOTING';

  if (!Number.isFinite(hbAge) && Number.isFinite(actionAge)) return 'BOOTING';

  return 'DEGRADED';
}

async function loadLatestJournalByAgent(): Promise<Record<string, SubstrateJournalEntry | null>> {
  const pairs = await Promise.all(
    AGENT_BASE.map(async (agent) => {
      try {
        const rows = await readAgentJournals(agent.id, 1);
        return [agent.name, rows[0] ?? null] as const;
      } catch {
        return [agent.name, null] as const;
      }
    }),
  );
  return Object.fromEntries(pairs);
}

export async function GET() {
  try {
    const [rawHeartbeat, giState, journalByAgent] = await Promise.all([
      kvGet<HeartbeatPayload | string>(KV_KEYS.HEARTBEAT),
      kvGet<GiStatePayload>(KV_KEYS.GI_STATE),
      loadLatestJournalByAgent(),
    ]);

    const heartbeat = parseHeartbeat(rawHeartbeat);
    const timestamp = heartbeat?.timestamp ?? new Date().toISOString();
    const cycle = heartbeat?.cycle ?? heartbeat?.cycleId ?? giState?.cycle ?? giState?.cycleId ?? 'unknown';

    staleSnapshot = { cycle, timestamp };

    const hbAgents = new Map((heartbeat?.agents ?? []).map((a) => [String(a.id ?? '').toLowerCase(), a]));

    const agents = AGENT_BASE.map((agent) => {
      const hb = hbAgents.get(agent.id);
      const lastSeen = heartbeat?.timestamp ?? null;
      const lastActionAt = heartbeat?.timestamp ?? null;
      const lastAction = hb?.last_action ?? (isFresh(timestamp, HEARTBEAT_FRESH_MS) ? 'heartbeat-refresh' : 'awaiting-runtime-proof');
      const journal = journalByAgent[agent.name] ?? null;
      const lastJournalAt = journal?.timestamp ?? null;
      const confidence = journal?.confidence ?? (isFresh(timestamp, HEARTBEAT_FRESH_MS) ? 0.75 : 0.5);
      const liveness = deriveLiveness({
        lastSeen: lastSeen ?? undefined,
        lastActionAt: lastActionAt ?? undefined,
        lastJournalAt: lastJournalAt ?? undefined,
        confidence,
      });
      const health = liveness === 'ACTIVE' ? 'nominal' : liveness === 'OFFLINE' ? 'critical' : 'degraded';
      const sourceBadges = [
        ...(lastSeen ? ['HB'] : []),
        ...(lastAction ? ['ACT'] : []),
        ...(lastJournalAt ? ['JRN'] : []),
      ];

      return {
        ...agent,
        declared: true,
        status: liveness.toLowerCase(),
        liveness,
        detail:
          liveness === 'ACTIVE'
            ? 'Live heartbeat/action/journal proof available.'
            : liveness === 'OFFLINE'
              ? 'No recent runtime evidence across heartbeat, action, and journal.'
              : 'Partial runtime proof; inspect freshness and lane dependencies.',
        heartbeat_ok: liveness === 'ACTIVE' || liveness === 'BOOTING' || liveness === 'DEGRADED',
        last_action: lastAction,
        last_seen: lastSeen,
        last_action_at: lastActionAt,
        last_journal: journal?.id ?? null,
        last_journal_at: lastJournalAt,
        confidence,
        health,
        source_badges: sourceBadges,
      };
    });

    const fresh = Boolean(heartbeat?.timestamp && isFresh(heartbeat.timestamp, HEARTBEAT_FRESH_MS));

    return NextResponse.json({
      ok: true,
      ...(fresh ? liveEnvelope(timestamp) : staleCacheEnvelope(timestamp, 'Heartbeat stale')),
      source: fresh ? 'kv-heartbeat' : 'stale-cache',
      cycle,
      timestamp,
      agents,
    });
  } catch (error) {
    const mock = mockAgentStatus();
    console.error('agents/status KV read failed', error);

    if (staleSnapshot) {
      return NextResponse.json({
        ok: true,
        ...staleCacheEnvelope(staleSnapshot.timestamp, 'Heartbeat stale'),
        source: 'stale-cache',
        cycle: staleSnapshot.cycle,
        timestamp: staleSnapshot.timestamp,
        agents: AGENT_BASE.map((agent) => ({
          ...agent,
          declared: true,
          status: 'offline',
          liveness: 'OFFLINE',
          detail: 'Status unavailable: stale snapshot fallback.',
          heartbeat_ok: false,
          last_action: 'Awaiting fresh runtime heartbeat',
          last_seen: null,
          last_action_at: null,
          last_journal: null,
          last_journal_at: null,
          confidence: 0,
          health: 'critical',
          source_badges: [],
        })),
      });
    }

    return NextResponse.json({
      ...mock,
      ...mockEnvelope('Runtime status unreachable'),
    });
  }
}
