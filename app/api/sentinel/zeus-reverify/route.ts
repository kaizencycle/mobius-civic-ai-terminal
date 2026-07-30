import { NextResponse } from 'next/server';
import { kvGetSafe } from '@/lib/kv/store';
import { appendZeusCronJournal } from '@/lib/agents/sentinel-cycle-journals';
import { computeCurrentCycleId } from '@/lib/terminal/cycle';

export const dynamic = 'force-dynamic';

type CurrentCycle = { cycle: string };
type GIState = { global_integrity: number };

export async function POST() {
  // Resolve current cycle and GI from KV; fall back to safe defaults.
  const [kvCycle, kvGi] = await Promise.all([
    kvGetSafe<CurrentCycle>('operator:current_cycle'),
    kvGetSafe<GIState>('gi:latest'),
  ]);
  const cycle = kvCycle?.cycle ?? computeCurrentCycleId();
  const giIsLive = typeof kvGi?.global_integrity === 'number' && Number.isFinite(kvGi.global_integrity);
  const gi = giIsLive ? kvGi!.global_integrity : 0.75;

  try {
    await appendZeusCronJournal({ cycle, gi, giIsLive, source: 'cron' });
    return NextResponse.json({ ok: true, cycle });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'zeus_journal_failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
