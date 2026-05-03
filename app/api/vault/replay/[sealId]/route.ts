import { NextRequest, NextResponse } from 'next/server';
import { getSeal } from '@/lib/vault-v2/store';

export const dynamic = 'force-dynamic';

type ReplayRow = {
  id: string;
  title: string;
  category: string;
  original_verdict: string;
  original_mii: number;
  replay_verdict: 'verified' | 'flagged';
  drift: number;
};

export async function GET(_req: NextRequest, context: { params: Promise<{ sealId: string }> }) {
  const { sealId } = await context.params;
  const seal = await getSeal(sealId);
  if (!seal) return NextResponse.json({ ok: false, error: 'Seal not found' }, { status: 404 });

  const events: ReplayRow[] = [];

  return NextResponse.json({
    ok: true,
    seal_id: sealId,
    seal: {
      sealed_at: seal.sealed_at,
      gi_at_seal: seal.gi_at_seal,
      seal_hash: seal.seal_hash,
      substrate_attested: Boolean(seal.substrate_attested_at),
      quorum_agents: Object.keys(seal.attestations ?? {}),
    },
    replay: {
      events,
      total: events.length,
      verified: events.filter((r) => r.replay_verdict === 'verified').length,
      flagged: events.filter((r) => r.replay_verdict === 'flagged').length,
      drifted: events.filter((r) => r.drift > 0.05).length,
      max_drift: Math.max(...events.map((r) => r.drift), 0),
      integrity_stable: events.every((r) => r.drift <= 0.05),
    },
    timestamp: new Date().toISOString(),
  });
}
