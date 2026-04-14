/**
 * GET /api/vault/status — global vault reserve (v1: deposits only, no Fountain).
 */

import { NextResponse } from 'next/server';
import { loadGIState } from '@/lib/kv/store';
import { getVaultStatusPayload } from '@/lib/vault/vault';

export const dynamic = 'force-dynamic';

export async function GET() {
  let gi: number | null = null;
  try {
    const st = await loadGIState();
    if (st && typeof st.global_integrity === 'number' && Number.isFinite(st.global_integrity)) {
      gi = Math.max(0, Math.min(1, st.global_integrity));
    }
  } catch {
    gi = null;
  }

  const body = await getVaultStatusPayload(gi);
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'vault-status' },
  });
}
