import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
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
import type { TrustTripwireSnapshot } from '@/lib/tripwire/types';
import { applyTrustTripwiresToAgentStatus } from '@/lib/tripwire/trustTripwires';

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

function getKvRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

async function loadLatestKvJournalTimestamp(agentName: string): Promise<string | null> {
  try {
    const redis = getKvRedis();
    if (!redis) return null;
    // agent:meta is updated on every appendJournalLaneEntry attempt (before idempotency gate),
    // so it reflects the actual sweep cadence rather than the dedup window.
    const meta = await redis.hgetall<Record<string, string>>(`agent:meta:${agentName.toLowerCase()}`);
    if (meta?.last_journal_at) return meta.last_journal_at;
    // Fallback: read most recent entry from the per-agent journal list.
    const key = `journal:${agentName.toLowerCase()}`;
    const rows = await redis.lrange<string>(key, 0, 0);
    if (!rows?.length) return null;
    const raw = rows[0];
    const parsed = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : raw;
    const ts = (parsed as Record<string, unknown>)?.timestamp;
    return typeof ts === 'string' ? ts : null;
  } catch {
    return null;
  }
}

const HEARTBEAT_FRESH_MS = Number(process.env.AGENT_HEARTBEAT_FRESH_MS ?? 300000);
const ACTION_FRESH_MS = Number(process.env.AGENT_ACTION_FRESH_MS ?? 900000);
const JOURNAL_FRESH_MS = Number(process.env.AGENT_JOURNAL_FRESH_MS ?? 3600000);
// KV lane entries are written by cron/sweep every 10 minutes and are considered
// fresh for up to 30 minutes — longer than GitHub substrate entries because they
// may not be promoted to substrate until the next cycle synthesis.
const KV_JOURNAL_FRESH_MS = Number(process.env.AGENT_KV_JOURNAL_FRESH_MS ?? 1800000);
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
  isKvFallback?: boolean;
}): LivenessState {
  if (input.contested) return 'CONTESTED';

  const hbAge = ageMs(input.lastSeen);
  const actionAge = ageMs(input.lastActionAt);
  const journalAge = ageMs(input.lastJournalAt);

  const hbFresh = isWithin(hbAge, HEARTBEAT_FRESH_MS);
  const actionFresh = isWithin(actionAge, ACTION_FRESH_MS);
  // C-298: KV fallback entries use a 30-minute window (cron/sweep cadence × 3).
  // GitHub substrate entries use the standard 1-hour JOURNAL_FRESH_MS.
  const journalFreshMs = input.isKvFallback ? KV_JOURNAL_FRESH_MS : JOURNAL_FRESH_MS;
  const journalFresh = isWithin(journalAge, journalFreshMs);

  // C-290: ACTIVE should reflect runtime liveness first.
  // Canon/journal freshness degrades health but should not freeze agents in BOOTING.
  if (hbFresh && actionFresh && input.confidence >= 0.6) {
    return journalFresh ? 'ACTIVE' : 'DEGRADED';
  }

  const noHeartbeat = !Number.isFinite(hbAge) || hbAge > OFFLINE_AFTER_MS;
  const noAction = !Number.isFinite(actionAge) || actionAge > OFFLINE_AFTER_MS;
  const noJournal = !Number.isFinite(journalAge) || journalAge > OFFLINE_AFTER_MS;
  if (noHeartbeat && noAction && noJournal) return 'OFFLINE';

  if (hbFresh && (!actionFresh || !journalFresh)) return 'BOOTING';

  if (!Number.isFinite(hbAge) && Number.isFinite(actionAge)) return 'BOOTING';

  return 'DEGRADED';
}

async function loadLatestJournalByAgent(): Promise<
  Record<string, (SubstrateJournalEntry & { _kv_fallback?: boolean }) | null>
> {
  const pairs = await Promise.all(
    AGENT_BASE.map(async (agent) => {
      let ghEntry: SubstrateJournalEntry | null = null;
      try {
        const rows = await readAgentJournals(agent.id, 1);
        ghEntry = rows[0] ?? null;
      } catch {
        // GitHub fetch failed — fall through to KV
      }

      // Always check KV lane — it reflects the most recent sweep cron write.
      // C-298: GitHub substrate entries can be 10+ days stale (last sync C-287/C-288)
      // while the KV lane is written every 10 minutes by cron/sweep. Prefer whichever
      // has the more recent timestamp so stale GitHub entries do not lock agents in DEGRADED.
      const kvTs = await loadLatestKvJournalTimestamp(agent.name);

      const ghTs = ghEntry?.timestamp ? new Date(ghEntry.timestamp).getTime() : 0;
      const kvTsMs = kvTs ? new Date(kvTs).getTime() : 0;

      // Use KV entry when it is fresher than the GitHub entry (or when GitHub failed).
      if (kvTsMs > ghTs) {
        const synthetic: SubstrateJournalEntry & { _kv_fallback: boolean } = {
          id: `kv-fallback-${agent.name.toLowerCase()}`,
          agent: agent.name,
          timestamp: kvTs!,
          cycle: 'kv-live',
          scope: 'kv-journal-lane',
          category: 'observation',
          severity: 'nominal',
          observation: 'KV journal lane entry — most recent activity.',
          inference: 'Agent active via cron sweep; substrate sync may lag.',
          recommendation: 'No action required.',
          confidence: 0.75,
          derivedFrom: [`journal:${agent.name.toLowerCase()}`],
          source: 'kv-fallback',
          tags: ['kv-fallback'],
          agentOrigin: agent.name,
          _kv_fallback: true,
        };
        return [agent.name, synthetic] as const;
      }

      if (ghEntry) return [agent.name, ghEntry] as const;
      return [agent.name, null] as const;
    }),
  );
  return Object.fromEntries(pairs);
}

export async function GET() {
  try {
    const [rawHeartbeat, giState, journalByAgent, trustTripwire] = await Promise.all([
      kvGet<HeartbeatPayload | string>(KV_KEYS.HEARTBEAT),
      kvGet<GiStatePayload>(KV_KEYS.GI_STATE),
      loadLatestJournalByAgent(),
      kvGet<TrustTripwireSnapshot>(KV_KEYS.TRIPWIRE_STATE_KV),
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
      const baseLiveness = deriveLiveness({
        lastSeen: lastSeen ?? undefined,
        lastActionAt: lastActionAt ?? undefined,
        lastJournalAt: lastJournalAt ?? undefined,
        confidence,
        isKvFallback: Boolean((journal as { _kv_fallback?: boolean } | null)?._kv_fallback),
      });
      const trustStatus = applyTrustTripwiresToAgentStatus(agent.name, trustTripwire);
      const liveness: LivenessState =
        baseLiveness === 'OFFLINE' || baseLiveness === 'BOOTING' || baseLiveness === 'DECLARED'
          ? baseLiveness
          : trustStatus === 'CONTESTED'
            ? 'CONTESTED'
            : trustStatus === 'DEGRADED' && baseLiveness === 'ACTIVE'
              ? 'DEGRADED'
              : baseLiveness;

      const health = liveness === 'ACTIVE' ? 'nominal' : liveness === 'OFFLINE' || liveness === 'CONTESTED' ? 'critical' : 'degraded';
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
