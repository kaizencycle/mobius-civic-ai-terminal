import { NextResponse } from 'next/server';
import { kvGetSafe } from '@/lib/kv/store';
import { appendZeusCronJournal } from '@/lib/agents/sentinel-cycle-journals';
import { computeCurrentCycleId } from '@/lib/terminal/cycle';

export const dynamic = 'force-dynamic';

type CurrentCycle = { cycle: string };

export async function POST() {
  // Resolve current cycle: prefer KV operator hint, fall back to epoch computation.
  const kvCycle = await kvGetSafe<CurrentCycle>('operator:current_cycle');
  const cycle = kvCycle?.cycle ?? computeCurrentCycleId();

  try {
    await appendZeusCronJournal({ cycle, source: 'cron' });
    return NextResponse.json({ ok: true, cycle });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'zeus_journal_failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
