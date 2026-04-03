import { NextResponse } from 'next/server';
import { getTreasuryAlerts } from '@/lib/treasury/alerts';
import { getTreasuryCrossCheck } from '@/lib/treasury/cross-check';
import { getTreasuryDeepComposition } from '@/lib/treasury/deep-composition';
import { getTreasuryWatchSnapshot } from '@/lib/treasury/watch';

export const dynamic = 'force-dynamic';

let lastGoodAlerts: Awaited<ReturnType<typeof getTreasuryAlerts>> | null = null;

async function classifyAlertsFailure() {
  try {
    await getTreasuryWatchSnapshot();
  } catch {
    return 'upstream_watch_snapshot_unavailable';
  }

  try {
    await getTreasuryCrossCheck();
  } catch {
    return 'upstream_cross_check_unavailable';
  }

  try {
    await getTreasuryDeepComposition();
  } catch {
    return 'upstream_deep_composition_unavailable';
  }

  return 'upstream_dependency_failure';
}

export async function GET() {
  try {
    const payload = await getTreasuryAlerts();
    lastGoodAlerts = payload;

    return NextResponse.json(
      {
        ok: true,
        degraded: false,
        source: 'primary',
        ...payload,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
          'X-Mobius-Source': 'treasury-alert-engine',
        },
      },
    );
  } catch (error) {
    const reason = await classifyAlertsFailure();
    console.error('[treasury/alerts] upstream failure', { reason, error });

    return NextResponse.json(
      {
        ok: false,
        degraded: true,
        reason,
        source: lastGoodAlerts ? 'last-good-cache' : 'fallback',
        ...(lastGoodAlerts ? { data: lastGoodAlerts } : {}),
      },
    );
  }
}
