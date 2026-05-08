import { NextResponse } from 'next/server';
import { kvGet, kvGetRaw, KV_KEYS } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

// journal:heartbeat is written via kvSetRawKey (no prefix) by /api/journal
// heartbeat:last, vault-attestation:lastRun, LAST_PROMOTION_RUN_AT are written via kvSet (mobius prefix)

export async function GET() {
  const [journalRaw, runtimeRaw, vaultTs, promoteTs] = await Promise.allSettled([
    kvGetRaw<{ lastWrite?: string; lastCycle?: string }>('journal:heartbeat'),
    kvGet<string | { timestamp?: string }>(KV_KEYS.HEARTBEAT),
    kvGet<number>('vault-attestation:lastRun'),
    kvGet<string>('LAST_PROMOTION_RUN_AT'),
  ]);

  const journal = journalRaw.status === 'fulfilled' ? (journalRaw.value?.lastWrite ?? null) : null;

  // kvGet(KV_KEYS.HEARTBEAT) returns the stored JSON string under primary Redis,
  // but backup Redis and the OAA bridge may return an already-parsed object.
  // Handle both shapes so runtime heartbeat is never falsely null during KV failover.
  let runtime: string | null = null;
  if (runtimeRaw.status === 'fulfilled' && runtimeRaw.value != null) {
    try {
      const val = runtimeRaw.value;
      const parsed: { timestamp?: string } =
        typeof val === 'string' ? (JSON.parse(val) as { timestamp?: string }) : val;
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
