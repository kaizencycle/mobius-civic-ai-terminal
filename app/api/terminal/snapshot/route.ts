import { NextRequest, NextResponse } from 'next/server';
import { GET as getIntegrity } from '@/app/api/integrity-status/route';
import { GET as getSignals } from '@/app/api/signals/micro/route';
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
import {
  normalizeAllSnapshotLanes,
  type SnapshotLaneKey,
  type SnapshotLaneState,
  type SnapshotLeaf,
} from '@/lib/terminal/snapshotLanes';
import type { SubstrateJournalEntry } from '@/lib/substrate/github-journal';
import { readAllSubstrateJournals } from '@/lib/substrate/github-reader';

export const dynamic = 'force-dynamic';

async function callHandler(request: NextRequest, handler: (request: NextRequest) => Promise<NextResponse>): Promise<SnapshotLeaf> {
  try {
    const response = await handler(request);
    const status = response.status;
    const payload = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status,
      data: payload,
      error: response.ok ? null : (typeof payload?.error === 'string' ? payload.error : `Request failed (${status})`),
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function makeRequest(baseUrl: string, path: string): NextRequest {
  return new NextRequest(new URL(path, baseUrl));
}

export async function GET(request: NextRequest) {
  const cycle = request.nextUrl.searchParams.get('cycle')?.trim();
  const includeCatalog = request.nextUrl.searchParams.get('include_catalog')?.trim();
  const baseUrl = request.nextUrl.origin;

  const journalPath = cycle ? `/api/agents/journal?cycle=${encodeURIComponent(cycle)}` : '/api/agents/journal';
  const epiconPath = includeCatalog === 'true' ? '/api/epicon/feed?include_catalog=true' : '/api/epicon/feed';

  const [integrity, signals, kvHealth, agents, epicon, echo, journal, sentiment, runtime, promotion, eve, mii] = await Promise.all([
    callHandler(makeRequest(baseUrl, '/api/integrity-status'), getIntegrity),
    callHandler(makeRequest(baseUrl, '/api/signals/micro'), getSignals),
    callHandler(makeRequest(baseUrl, '/api/kv/health'), getKvHealth),
    callHandler(makeRequest(baseUrl, '/api/agents/status'), getAgents),
    callHandler(makeRequest(baseUrl, epiconPath), getEpicon),
    callHandler(makeRequest(baseUrl, '/api/echo/feed'), getEcho),
    callHandler(makeRequest(baseUrl, journalPath), getJournal),
    callHandler(makeRequest(baseUrl, '/api/sentiment/composite'), getSentiment),
    callHandler(makeRequest(baseUrl, '/api/runtime/status'), getRuntime),
    callHandler(makeRequest(baseUrl, '/api/epicon/promotion-status'), getPromotion),
    callHandler(makeRequest(baseUrl, '/api/eve/cycle-advance'), getEve),
    callHandler(makeRequest(baseUrl, '/api/mii/feed'), getMii),
  ]);

  type SubstrateAgentRow = {
    agent: string;
    lastEntry: SubstrateJournalEntry | null;
    entryCount: number;
  };

  const SUBSTRATE_JOURNALS_TREE =
    'https://github.com/kaizencycle/Mobius-Substrate/tree/main/journals';

  let substrate: {
    ok: boolean;
    totalEntries: number;
    agents: SubstrateAgentRow[];
    repoUrl: string;
    /** @deprecated Prefer `agents` (same rows as before C-274 shape refresh). */
    latest: { agent: string; lastEntry: SubstrateJournalEntry }[];
  };
  try {
    const substrateJournals = await readAllSubstrateJournals(3);
    const totalEntries = Object.values(substrateJournals).reduce((sum, arr) => sum + arr.length, 0);
    const agentRows: SubstrateAgentRow[] = Object.entries(substrateJournals).map(([agent, entries]) => ({
      agent,
      lastEntry: entries[0] ?? null,
      entryCount: entries.length,
    }));
    const withEntries = agentRows.filter((x) => x.lastEntry !== null);
    substrate = {
      ok: true,
      totalEntries,
      agents: withEntries,
      repoUrl: SUBSTRATE_JOURNALS_TREE,
      latest: withEntries.map(({ agent, lastEntry }) => ({
        agent,
        lastEntry: lastEntry as SubstrateJournalEntry,
      })),
    };
  } catch (error) {
    console.error('[terminal/snapshot] substrate journals read failed', error);
    substrate = {
      ok: false,
      totalEntries: 0,
      agents: [],
      repoUrl: SUBSTRATE_JOURNALS_TREE,
      latest: [],
    };
  }

  const leaves: Record<SnapshotLaneKey, SnapshotLeaf> = {
    integrity,
    signals,
    kvHealth,
    agents,
    epicon,
    echo,
    journal,
    sentiment,
    runtime,
    promotion,
    eve,
    mii,
  };

  const lanes: SnapshotLaneState[] = normalizeAllSnapshotLanes(leaves);
  const laneSummary = lanes.every(
    (lane) => lane.state === 'healthy' || lane.state === 'empty' || lane.state === 'stale',
  );

  return NextResponse.json(
    {
      ok: laneSummary,
      cycle: cycle ?? null,
      include_catalog: includeCatalog === 'true',
      timestamp: new Date().toISOString(),
      deployment: {
        commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        environment: process.env.VERCEL_ENV ?? null,
      },
      lanes,
      integrity,
      signals,
      kvHealth,
      agents,
      epicon,
      echo,
      journal,
      sentiment,
      runtime,
      promotion,
      eve,
      mii,
      substrate,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Mobius-Source': 'terminal-snapshot',
      },
    },
  );
}
