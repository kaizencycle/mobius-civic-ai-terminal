import { NextRequest, NextResponse } from 'next/server';
import { GET as getIntegrity } from '@/app/api/integrity-status/route';
import { GET as getKvHealth } from '@/app/api/kv/health/route';
import { GET as getAgents } from '@/app/api/agents/status/route';
import { GET as getEpicon } from '@/app/api/epicon/feed/route';
import { GET as getEcho } from '@/app/api/echo/feed/route';
import { GET as getJournal } from '@/app/api/agents/journal/route';
import { GET as getSentiment } from '@/app/api/sentiment/composite/route';
import { GET as getRuntime } from '@/app/api/runtime/status/route';
import { GET as getPromotion } from '@/app/api/epicon/promotion-status/route';
import { GET as getEve } from '@/app/api/eve/cycle-advance/route';
import { GET as getMii } from '@/app/api/mii/feed/route';
import { GET as getVault } from '@/app/api/vault/status/route';
import { GET as getMicReadiness } from '@/app/api/mic/readiness/route';
import { GET as getTripwire } from '@/app/api/tripwire/status/route';
import { GET as getTrustTripwire } from '@/app/api/tripwire/trust/route';
import { GET as getSnapshotLite } from '@/app/api/terminal/snapshot-lite/route';
import { memoryModeFromIntegrityPayload, memoryModeFromSnapshotLiteBody } from '@/lib/terminal/memoryMode';
import { loadSignalSnapshot, isRedisAvailable } from '@/lib/kv/store';
import {
  normalizeAllSnapshotLanes,
  type SnapshotLaneKey,
  type SnapshotLaneState,
  type SnapshotLeaf,
} from '@/lib/terminal/snapshotLanes';
import type { SubstrateJournalEntry } from '@/lib/substrate/github-journal';
import { readAllSubstrateJournals } from '@/lib/substrate/github-reader';
import { trustMultiplier } from '@/lib/tripwire/trustTripwires';
import type { TrustTripwireSnapshot } from '@/lib/tripwire/types';

export const dynamic = 'force-dynamic';

const LANE_TIMEOUT_MS = 5_000;

async function timedHandler(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<NextResponse>,
): Promise<{ leaf: SnapshotLeaf; duration_ms: number }> {
  const start = Date.now();
  try {
    const response = await Promise.race([
      handler(request),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('lane_timeout')), LANE_TIMEOUT_MS)),
    ]);
    const status = response.status;
    const payload = await response.json().catch(() => null);
    return {
      leaf: {
        ok: response.ok,
        status,
        data: payload,
        error: response.ok ? null : (typeof payload?.error === 'string' ? payload.error : `Request failed (${status})`),
      },
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      leaf: { ok: false, status: 408, data: null, error: msg },
      duration_ms: Date.now() - start,
    };
  }
}

function makeRequest(baseUrl: string, path: string): NextRequest {
  return new NextRequest(new URL(path, baseUrl));
}

export async function GET(request: NextRequest) {
  const totalStart = Date.now();
  const cycle = request.nextUrl.searchParams.get('cycle')?.trim();
  const includeCatalog = request.nextUrl.searchParams.get('include_catalog')?.trim();
  const includeSubstrate = request.nextUrl.searchParams.get('include_substrate')?.trim();
  const journalMode = (request.nextUrl.searchParams.get('journal_mode')?.trim().toLowerCase() ?? 'merged');
  const journalLimit = request.nextUrl.searchParams.get('journal_limit')?.trim();
  const baseUrl = request.nextUrl.origin;
  try {

  const journalQuery = new URLSearchParams();
  if (cycle) journalQuery.set('cycle', cycle);
  if (journalMode === 'hot' || journalMode === 'canon' || journalMode === 'merged') journalQuery.set('mode', journalMode);
  if (journalLimit) journalQuery.set('limit', journalLimit);
  const journalPath = `/api/agents/journal${journalQuery.toString() ? `?${journalQuery.toString()}` : ''}`;
  const epiconPath = includeCatalog === 'true' ? '/api/epicon/feed?include_catalog=true' : '/api/epicon/feed';

  const signalsStart = Date.now();
  const cachedPromise = loadSignalSnapshot().catch(() => null);
  const lanesPromise = Promise.all([
    timedHandler(makeRequest(baseUrl, '/api/integrity-status'), getIntegrity),
    timedHandler(makeRequest(baseUrl, '/api/kv/health'), getKvHealth),
    timedHandler(makeRequest(baseUrl, '/api/agents/status'), getAgents),
    timedHandler(makeRequest(baseUrl, epiconPath), getEpicon),
    timedHandler(makeRequest(baseUrl, '/api/echo/feed'), getEcho),
    timedHandler(makeRequest(baseUrl, journalPath), getJournal),
    timedHandler(makeRequest(baseUrl, '/api/sentiment/composite'), getSentiment),
    timedHandler(makeRequest(baseUrl, '/api/runtime/status'), getRuntime),
    timedHandler(makeRequest(baseUrl, '/api/epicon/promotion-status'), getPromotion),
    timedHandler(makeRequest(baseUrl, '/api/eve/cycle-advance'), getEve),
    timedHandler(makeRequest(baseUrl, '/api/mii/feed'), getMii),
    timedHandler(makeRequest(baseUrl, '/api/vault/status'), getVault),
    timedHandler(makeRequest(baseUrl, '/api/mic/readiness'), getMicReadiness),
    timedHandler(makeRequest(baseUrl, '/api/tripwire/status'), getTripwire),
    timedHandler(makeRequest(baseUrl, '/api/tripwire/trust'), getTrustTripwire),
  ]);

  const litePromise = timedHandler(makeRequest(baseUrl, '/api/terminal/snapshot-lite'), getSnapshotLite);
  const [cached, results, liteResult] = await Promise.all([cachedPromise, lanesPromise, litePromise]);

  let signals: SnapshotLeaf;
  let signalsDuration: number;
  if (cached) {
    signals = { ok: true, status: 200, data: { ok: true, cached: true, kv: isRedisAvailable(), ...cached }, error: null };
    signalsDuration = Date.now() - signalsStart;
  } else {
    const { GET: getSignals } = await import('@/app/api/signals/micro/route');
    const result = await timedHandler(makeRequest(baseUrl, '/api/signals/micro'), getSignals);
    signals = result.leaf;
    signalsDuration = Date.now() - signalsStart;
  }

  const [integrity, kvHealth, agents, epicon, echo, journal, sentiment, runtime, promotion, eve, mii, vault, micReadiness, tripwire, trustTripwire] =
    results;

  const litePayload = liteResult.leaf.data as Record<string, unknown> | null;

  const timings: Record<string, number> = {
    signals: signalsDuration,
    snapshot_lite: liteResult.duration_ms,
    integrity: integrity.duration_ms,
    kvHealth: kvHealth.duration_ms,
    agents: agents.duration_ms,
    epicon: epicon.duration_ms,
    echo: echo.duration_ms,
    journal: journal.duration_ms,
    sentiment: sentiment.duration_ms,
    runtime: runtime.duration_ms,
    promotion: promotion.duration_ms,
    eve: eve.duration_ms,
    mii: mii.duration_ms,
    vault: vault.duration_ms,
    micReadiness: micReadiness.duration_ms,
    tripwire: tripwire.duration_ms,
    trustTripwire: trustTripwire.duration_ms,
  };

  type SubstrateAgentRow = { agent: string; lastEntry: SubstrateJournalEntry | null; entryCount: number };
  const SUBSTRATE_JOURNALS_TREE = 'https://github.com/kaizencycle/Mobius-Substrate/tree/main/journals';

  let substrate: { ok: boolean; totalEntries: number; agents: SubstrateAgentRow[]; repoUrl: string; latest: { agent: string; lastEntry: SubstrateJournalEntry }[] };

  if (includeSubstrate === 'true') {
    const subStart = Date.now();
    try {
      const substrateJournals = await Promise.race([
        readAllSubstrateJournals(3),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('substrate_timeout')), 4000)),
      ]);
      const totalEntries = Object.values(substrateJournals).reduce((sum, arr) => sum + arr.length, 0);
      const agentRows: SubstrateAgentRow[] = Object.entries(substrateJournals).map(([agent, entries]) => ({
        agent, lastEntry: entries[0] ?? null, entryCount: entries.length,
      }));
      const withEntries = agentRows.filter((x) => x.lastEntry !== null);
      substrate = {
        ok: true, totalEntries, agents: withEntries, repoUrl: SUBSTRATE_JOURNALS_TREE,
        latest: withEntries.map(({ agent, lastEntry }) => ({ agent, lastEntry: lastEntry as SubstrateJournalEntry })),
      };
    } catch {
      substrate = { ok: false, totalEntries: 0, agents: [], repoUrl: SUBSTRATE_JOURNALS_TREE, latest: [] };
    }
    timings.substrate = Date.now() - subStart;
  } else {
    substrate = { ok: true, totalEntries: 0, agents: [], repoUrl: SUBSTRATE_JOURNALS_TREE, latest: [] };
  }

  const leaves: Record<SnapshotLaneKey, SnapshotLeaf> = {
    integrity: integrity.leaf, signals, kvHealth: kvHealth.leaf, agents: agents.leaf,
    epicon: epicon.leaf, echo: echo.leaf, journal: journal.leaf, sentiment: sentiment.leaf,
    runtime: runtime.leaf, promotion: promotion.leaf, eve: eve.leaf, mii: mii.leaf, vault: vault.leaf,
    micReadiness: micReadiness.leaf, tripwire: tripwire.leaf,
  };

  let lanes: SnapshotLaneState[] = [];
  try {
    lanes = normalizeAllSnapshotLanes(leaves);
  } catch (error) {
    console.error('[snapshot] lane normalize fail', error);
    lanes = [];
  }
  const laneByKey = new Map(lanes.map((lane) => [lane.key, lane]));
  const criticalLaneKeys: SnapshotLaneKey[] = ['integrity', 'signals', 'kvHealth'];
  // C-283 (ATLAS audit): `stale` and `promotable` are legitimate operational
  // states — cached KV data inside the documented TTL window, or an active
  // promotion queue awaiting commit. Treating them as "not ok" flipped the
  // top-level `ok` to false whenever signals aged past 5 min between cron
  // runs, which is most of the time. Preserve these as OK for criticalOk;
  // `degraded` is also allowed (explicitly degraded but still serving truth).
  const CRITICAL_OK_STATES = new Set(['healthy', 'degraded', 'stale', 'promotable']);
  const criticalOk = criticalLaneKeys.every((key) => {
    const state = laneByKey.get(key)?.state;
    return state !== undefined && CRITICAL_OK_STATES.has(state);
  });
  const criticalFail = criticalLaneKeys.some((key) => {
    const leaf = leaves[key];
    return !leaf.ok && (leaf.status >= 500 || leaf.status === 0);
  });

  const eveData = (eve.leaf.data ?? {}) as Record<string, unknown>;
  const eveCycle = typeof eveData.currentCycle === 'string' ? eveData.currentCycle
    : typeof eveData.cycleId === 'string' ? eveData.cycleId : null;

  const totalMs = Date.now() - totalStart;

  const memoryMode =
    liteResult.leaf.ok && litePayload && typeof litePayload === 'object'
      ? memoryModeFromSnapshotLiteBody(litePayload)
      : memoryModeFromIntegrityPayload(integrity.leaf.data as Record<string, unknown> | null);

  const integrityData = integrity.leaf.data as Record<string, unknown> | null;
  const topGi =
    typeof memoryMode?.gi_value === 'number' && Number.isFinite(memoryMode.gi_value)
      ? memoryMode.gi_value
      : typeof integrityData?.global_integrity === 'number' && Number.isFinite(integrityData.global_integrity)
        ? integrityData.global_integrity
        : null;
  const trustPayload = (trustTripwire.leaf.data ?? {}) as Record<string, unknown> | null;
  const trustSnapshot = (trustPayload?.trust_tripwire ?? null) as TrustTripwireSnapshot | null;
  const effectiveGi = typeof topGi === 'number' ? Number((topGi * trustMultiplier(trustSnapshot)).toFixed(4)) : null;

  const journalData = journal.leaf.data as Record<string, unknown> | null;
  const journalEntries = Array.isArray(journalData?.entries) ? journalData?.entries as Record<string, unknown>[] : [];
  let journalSummary: { latest_agent_entries: Record<string, unknown>[] } = { latest_agent_entries: [] };
  try {
    journalSummary = {
      latest_agent_entries: journalEntries.slice(0, 8).map((entry) => ({
        agent: typeof entry.agent === 'string' ? entry.agent.toLowerCase() : 'unknown',
        source: typeof entry.source_mode === 'string' ? entry.source_mode : 'unknown',
        timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : null,
        severity: typeof entry.severity === 'string' ? entry.severity : 'nominal',
        summary: typeof entry.observation === 'string' ? entry.observation : '—',
        cycle: typeof entry.cycle === 'string' ? entry.cycle : null,
        canonical_path: typeof entry.canonical_path === 'string' ? entry.canonical_path : null,
      })),
    };
  } catch (error) {
    console.error('[snapshot] journal summary failed', error);
    journalSummary = { latest_agent_entries: [] };
  }

  const agentsData = agents.leaf.data as Record<string, unknown> | null;
  const agentRows = Array.isArray(agentsData?.agents) ? agentsData?.agents as Record<string, unknown>[] : [];
  let agentLiveness: Record<string, unknown>[] = [];
  try {
    agentLiveness = agentRows.map((agent) => ({
      agent: typeof agent.name === 'string' ? agent.name : 'UNKNOWN',
      status: typeof agent.liveness === 'string' ? agent.liveness : typeof agent.status === 'string' ? agent.status : 'DECLARED',
      lane: typeof agent.lane === 'string' ? agent.lane : null,
      role: typeof agent.role === 'string' ? agent.role : null,
      last_seen: typeof agent.last_seen === 'string' ? agent.last_seen : null,
      last_action: typeof agent.last_action === 'string' ? agent.last_action : null,
      last_journal_at: typeof agent.last_journal_at === 'string' ? agent.last_journal_at : null,
      confidence: typeof agent.confidence === 'number' ? agent.confidence : null,
      source_badges: Array.isArray(agent.source_badges) ? agent.source_badges : [],
    }));
  } catch (error) {
    console.error('[snapshot] agent liveness failed', error);
    agentLiveness = [];
  }

  const tripwireLaneState = laneByKey.get('tripwire');
  const tripwireElevated = tripwireLaneState?.state === 'degraded';
  const topDegraded =
    memoryMode?.degraded === true ||
    tripwireElevated ||
    Boolean(trustSnapshot?.elevated) ||
    Boolean(integrityData?.gi_degraded ?? integrityData?.degraded) ||
    (typeof integrityData?.mode === 'string' && (integrityData.mode === 'red' || integrityData.mode === 'yellow'));

  const trustSummary = trustSnapshot
    ? {
        elevated: trustSnapshot.elevated,
        critical: trustSnapshot.critical,
        tripwireCount: trustSnapshot.tripwireCount,
        top: trustSnapshot.results
          .filter((result) => result.triggered)
          .slice(0, 5)
          .map((result) => ({
            kind: result.kind,
            severity: result.severity,
            message: result.message,
            affectedAgents: result.affectedAgents ?? [],
          })),
      }
    : { elevated: false, critical: false, tripwireCount: 0, top: [] };

    console.log('[snapshot] SUCCESS', {
      lanesCount: lanes.length,
      agentCount: agentLiveness.length,
      journalCount: journalEntries.length,
    });

    return NextResponse.json({
      ok: criticalOk && !criticalFail,
      cycle: eveCycle ?? cycle ?? null,
      gi: topGi,
      effective_gi: effectiveGi,
      degraded: topDegraded,
      include_catalog: includeCatalog === 'true',
      journal_mode: journalMode === 'hot' || journalMode === 'canon' || journalMode === 'merged' ? journalMode : 'merged',
      timestamp: new Date().toISOString(),
      deployment: {
        commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        environment: process.env.VERCEL_ENV ?? null,
      },
      meta: { total_ms: totalMs, lane_ms: timings },
      memory_mode: memoryMode,
      trust_tripwire: trustSummary,
      lanes,
      journal_summary: journalSummary,
      agent_liveness: agentLiveness,
      integrity: integrity.leaf, signals, kvHealth: kvHealth.leaf, agents: agents.leaf,
      epicon: epicon.leaf, echo: echo.leaf, journal: journal.leaf, sentiment: sentiment.leaf,
      runtime: runtime.leaf, promotion: promotion.leaf, eve: eve.leaf, mii: mii.leaf, vault: vault.leaf,
      micReadiness: micReadiness.leaf,
      tripwire: tripwire.leaf,
      trustTripwire: trustTripwire.leaf,
      substrate,
    }, {
      headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'terminal-snapshot' },
    });
  } catch (error) {
    console.error('[snapshot] fatal', error);
    const msg = error instanceof Error ? error.message : 'snapshot_failed';
    const fallbackLeaf = { ok: false, status: 500, data: null, error: msg };
    return NextResponse.json({
      ok: false,
      fallback: true,
      error: 'snapshot_failed',
      cycle: cycle ?? null,
      gi: null,
      effective_gi: null,
      degraded: true,
      include_catalog: includeCatalog === 'true',
      journal_mode: journalMode === 'hot' || journalMode === 'canon' || journalMode === 'merged' ? journalMode : 'merged',
      timestamp: new Date().toISOString(),
      deployment: {
        commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        environment: process.env.VERCEL_ENV ?? null,
      },
      meta: { total_ms: Date.now() - totalStart, lane_ms: {} },
      memory_mode: null,
      trust_tripwire: { elevated: false, critical: false, tripwireCount: 0, top: [] },
      lanes: [],
      journal_summary: { latest_agent_entries: [] },
      agent_liveness: [],
      integrity: fallbackLeaf,
      signals: fallbackLeaf,
      kvHealth: fallbackLeaf,
      agents: fallbackLeaf,
      epicon: fallbackLeaf,
      echo: fallbackLeaf,
      journal: fallbackLeaf,
      sentiment: fallbackLeaf,
      runtime: fallbackLeaf,
      promotion: fallbackLeaf,
      eve: fallbackLeaf,
      mii: fallbackLeaf,
      vault: fallbackLeaf,
      micReadiness: fallbackLeaf,
      tripwire: fallbackLeaf,
      trustTripwire: fallbackLeaf,
      substrate: { ok: false, totalEntries: 0, agents: [], repoUrl: null, latest: [] },
    }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'terminal-snapshot-fallback' },
    });
  }
}
