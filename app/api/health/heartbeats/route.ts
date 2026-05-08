import { NextResponse } from 'next/server';
import { kvGet, kvGetRaw, KV_KEYS } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

// journal:heartbeat is written via kvSetRawKey (no prefix) by /api/journal
// heartbeat:last, vault-attestation:lastRun, LAST_PROMOTION_RUN_AT are written via kvSet (mobius prefix)

export async function GET() {
  const [journalRaw, runtimeRaw, vaultTs, promoteTs] = await Promise.allSettled([
    kvGetRaw<{ lastWrite?: string; lastCycle?: string }>('journal:heartbeat'),
    kvGet<string>(KV_KEYS.HEARTBEAT),
    kvGet<number>('vault-attestation:lastRun'),
    kvGet<string>('LAST_PROMOTION_RUN_AT'),
  ]);

  const journal = journalRaw.status === 'fulfilled' ? (journalRaw.value?.lastWrite ?? null) : null;

  let runtime: string | null = null;
  if (runtimeRaw.status === 'fulfilled' && runtimeRaw.value) {
    try {
      const parsed = JSON.parse(runtimeRaw.value) as { timestamp?: string };
      runtime = parsed.timestamp ?? null;
    } catch {
      runtime = null;
    }
  }

  const vault = vaultTs.status === 'fulfilled' && vaultTs.value
    ? new Date(vaultTs.value).toISOString()
    : null;

  const promote = promoteTs.status === 'fulfilled' ? (promoteTs.value ?? null) : null;

  return NextResponse.json({
    journal,
    runtime,
    vault,
    promote,
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
  });
}
