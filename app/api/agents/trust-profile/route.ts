import { NextResponse } from 'next/server';
import type { LedgerEntry } from '@/lib/terminal/types';
import { computeLedgerTrustProfile, summarizeAgentTrust } from '@/lib/agents/trust-weight';

async function fetchLedger(): Promise<LedgerEntry[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || '';
  const res = await fetch(`${base}/api/chambers/ledger`, { cache: 'no-store' });
  if (!res.ok) throw new Error('ledger fetch failed');
  const json = await res.json();
  return json?.entries || [];
}

export async function GET() {
  try {
    const entries = await fetchLedger();

    const enriched = entries.map((e) => ({
      ...e,
      trust: computeLedgerTrustProfile(e),
    }));

    const agents = summarizeAgentTrust(entries);

    return NextResponse.json({
      ok: true,
      count: entries.length,
      agents,
      sample: enriched.slice(0, 25),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'unknown' }, { status: 500 });
  }
}
