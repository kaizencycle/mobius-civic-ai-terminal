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
    // OPT-5 (C-291): replace 'as never' casts with NextRequest construction.
    // The 'as never' suppressed type errors but is unsafe if handler signatures change.
    const { NextRequest: Req } = await import('next/server');
    const [liteRes, agentsRes, journalRes, vaultRes] = await Promise.all([
      getSnapshotLite(new Req('http://localhost/api/terminal/snapshot-lite')),
      getAgentsStatus(),
      getAgentsJournal(new Req('http://localhost/api/agents/journal?mode=hot&limit=8')),
      getVaultStatus(new Req('http://localhost/api/vault/status')),
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
        // OPT-05 (C-296): increased from s-maxage=15 → 30. Digest is rebuilt from
        // KV/in-memory state on each compute; 30s edge cache cuts ~50% of invocations
        // (~1,440/day saved) without meaningfully lagging the cron update cadence.
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
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

        predictive: {
          risk_level: 'critical',
          signals: ['digest_unavailable'],
          recommendation: 'maintain snapshot preview mode until digest recovers',
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
