import { NextResponse } from 'next/server';
import { GET as getSnapshotLite } from '@/app/api/terminal/snapshot-lite/route';
import { GET as getAgentsStatus } from '@/app/api/agents/status/route';
import { GET as getAgentsJournal } from '@/app/api/agents/journal/route';
import { GET as getVaultStatus } from '@/app/api/vault/status/route';
import { getPublicEpiconFeed } from '@/lib/epicon/feedStore';
import { buildEchoDigest } from '@/lib/echo/buildDigest';

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date().toISOString();

  try {
    const [liteRes, agentsRes, journalRes, vaultRes] = await Promise.all([
      getSnapshotLite(new Request('http://localhost/api/terminal/snapshot-lite') as never),
      getAgentsStatus(),
      getAgentsJournal(new Request('http://localhost/api/agents/journal?mode=hot&limit=8') as never),
      getVaultStatus(new Request('http://localhost/api/vault/status') as never),
    ]);

    const lite = (await liteRes.json()) as Record<string, unknown>;
    const agentsJson = (await agentsRes.json()) as { agents?: unknown[] };
    const journalJson = (await journalRes.json()) as { entries?: unknown[] };
    const vaultJson = (await vaultRes.json()) as Record<string, unknown>;

    const feed = getPublicEpiconFeed();
    const promotion = {
      pending: feed.filter((r) => r.status === 'pending' || r.status === 'developing').length,
      promoted: feed.filter((r) => r.status === 'verified').length,
      contested: feed.filter((r) => r.status === 'contradicted').length,
    };

    const digest = buildEchoDigest({
      snapshotLite: lite,
      agents: Array.isArray(agentsJson.agents) ? agentsJson.agents as Array<Record<string, unknown>> : [],
      journalEntries: Array.isArray(journalJson.entries) ? journalJson.entries as Array<Record<string, unknown>> : [],
      promotion,
      vault: vaultJson,
    });

    return NextResponse.json(digest, {
      headers: {
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
        'X-Mobius-Source': 'echo-digest',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'echo_digest_failed';
    return NextResponse.json(
      {
        ok: true,
        cycle: 'C-—',
        timestamp: now,
        dva_mode: 'lite',
        source: 'echo-digest',
        degraded: true,
        integrity: {
          gi: null,
          mode: 'yellow',
          status: 'stressed',
        },
        summary: {
          headline: 'Digest fallback active. Snapshot lanes unavailable.',
          top_warnings: [message],
        },
        signals_preview: {
          instrument_count: 0,
          anomalies: 0,
          freshness: 'unknown',
          top_agents: [],
        },
        journal_preview: {
          mode: 'hot',
          latest_count: 0,
          cycles: [],
          archive_stale: true,
        },
        ledger_preview: {
          rows: 0,
          pending: 0,
          promoted: 0,
          contested: 0,
          status: 'degraded',
        },
        agents_preview: {
          active_like: 0,
          booting: 0,
          heartbeat_stale: [],
        },
        vault_preview: {
          reserve: null,
          tranche: null,
          fountain_locked: true,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'X-Mobius-Source': 'echo-digest-fallback',
        },
      },
    );
  }
}
