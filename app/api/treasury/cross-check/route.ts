import { NextResponse } from 'next/server';
import { getTreasuryCrossCheck } from '@/lib/treasury/cross-check';

export const dynamic = 'force-dynamic';

let lastGoodCrossCheck: Awaited<ReturnType<typeof getTreasuryCrossCheck>> | null = null;

function classifyCrossCheckFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('schedules')) return 'upstream_schedules_unavailable';
  if (message.includes('mspd')) return 'upstream_mspd_unavailable';
  if (message.includes('no rows')) return 'upstream_empty_dataset';
  return 'upstream_dependency_failure';
}

export async function GET() {
  try {
    const payload = await getTreasuryCrossCheck();
    lastGoodCrossCheck = payload;

    return NextResponse.json(
      {
        ok: true,
        degraded: false,
        ...payload,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
          'X-Mobius-Source': 'treasury-cross-check',
        },
      },
    );
  } catch (error) {
    const reason = classifyCrossCheckFailure(error);
    console.error('[treasury/cross-check] upstream failure', { reason, error });

    return NextResponse.json(
      {
        ok: false,
        degraded: true,
        reason,
        source: lastGoodCrossCheck ? 'last-good-cache' : 'fallback',
        ...(lastGoodCrossCheck ? { data: lastGoodCrossCheck } : {}),
      },
    );
  }
}
