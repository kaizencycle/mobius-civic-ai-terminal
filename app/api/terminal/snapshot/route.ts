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
import { loadSignalSnapshot, isRedisAvailable } from '@/lib/kv/store';
import {
  normalizeAllSnapshotLanes,
  type SnapshotLaneKey,
  type SnapshotLaneState,
  type SnapshotLeaf,
} from '@/lib/terminal/snapshotLanes';
import type { SubstrateJournalEntry } from '@/lib/substrate/github-journal';
import { readAllSubstrateJournals } from '@/lib/substrate/github-reader';

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
  const baseUrl = request.nextUrl.origin;

  const journalPath = cycle ? `/api/agents/journal?cycle=${encodeURIComponent(cycle)}` : '/api/agents/journal';
  const epiconPath = includeCatalog === 'true' ? '/api/epicon/feed?include_catalog=true' : '/api/epicon/feed';

  const signalsStart = Date.now();
  let signals: SnapshotLeaf;
  let signalsDuration: number;
  const cached = await loadSignalSnapshot();
  if (cached) {
    signals = { ok: true, status: 200, data: { ok: true, cached: true, kv: isRedisAvailable(), ...cached }, error: null };
    signalsDuration = Date.now() - signalsStart;
  } else {
    const { GET: getSignals } = await import('@/app/api/signals/micro/route');
    const result = await timedHandler(makeRequest(baseUrl, '/api/signals/micro'), getSignals);
    signals = result.leaf;
    signalsDuration = result.duration_ms;
  }

  const results = await Promise.all([
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
  ]);

  const [integrity, kvHealth, agents, epicon, echo, journal, sentiment, runtime, promotion, eve, mii, vault] = results;

  const timings: Record<string, number> = {
    signals: signalsDuration,
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
  };

  const lanes: SnapshotLaneState[] = normalizeAllSnapshotLanes(leaves);
  const laneByKey = new Map(lanes.map((lane) => [lane.key, lane]));
  const criticalLaneKeys: SnapshotLaneKey[] = ['integrity', 'signals', 'kvHealth'];
  const criticalOk = criticalLaneKeys.every((key) => {
    const state = laneByKey.get(key)?.state;
    return state === 'healthy' || state === 'degraded';
  });
  const criticalFail = criticalLaneKeys.some((key) => {
    const leaf = leaves[key];
    return !leaf.ok && (leaf.status >= 500 || leaf.status === 0);
  });

  const eveData = (eve.leaf.data ?? {}) as Record<string, unknown>;
  const eveCycle = typeof eveData.currentCycle === 'string' ? eveData.currentCycle
    : typeof eveData.cycleId === 'string' ? eveData.cycleId : null;

  const totalMs = Date.now() - totalStart;

  return NextResponse.json({
    ok: criticalOk && !criticalFail,
    cycle: eveCycle ?? cycle ?? null,
    include_catalog: includeCatalog === 'true',
    timestamp: new Date().toISOString(),
    deployment: {
      commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      environment: process.env.VERCEL_ENV ?? null,
    },
    meta: { total_ms: totalMs, lane_ms: timings },
    lanes,
    integrity: integrity.leaf, signals, kvHealth: kvHealth.leaf, agents: agents.leaf,
    epicon: epicon.leaf, echo: echo.leaf, journal: journal.leaf, sentiment: sentiment.leaf,
    runtime: runtime.leaf, promotion: promotion.leaf, eve: eve.leaf, mii: mii.leaf, vault: vault.leaf,
    substrate,
  }, {
    headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'terminal-snapshot' },
  });
}
