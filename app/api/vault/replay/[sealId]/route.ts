import { type NextRequest, NextResponse } from 'next/server';
import { getSeal } from '@/lib/vault-v2/store';
import { kvGet } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

type EpiconItem = {
  id: string;
  title?: string;
  category?: string;
  status?: string;
  mii?: number;
  confidenceTier?: number;
  [key: string]: unknown;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { sealId: string } },
) {
  const { sealId } = params;

  if (!sealId || typeof sealId !== 'string') {
    return NextResponse.json({ ok: false, error: 'missing_seal_id' }, { status: 400 });
  }

  const seal = await getSeal(sealId);
  if (!seal) {
    return NextResponse.json({ ok: false, error: 'Seal not found' }, { status: 404 });
  }

  // Load EPICON events from ECHO memory for this cycle's seal window.
  const echoRaw = await kvGet<EpiconItem[] | string>('echo:epicon:latest').catch(() => null);
  let events: EpiconItem[] = [];
  if (Array.isArray(echoRaw)) {
    events = echoRaw;
  } else if (typeof echoRaw === 'string') {
    try {
      const parsed = JSON.parse(echoRaw) as unknown;
      if (Array.isArray(parsed)) events = parsed as EpiconItem[];
    } catch {
      // ignore parse error — proceed with empty events
    }
  }

  const avgMii = typeof seal.gi_at_seal === 'number' ? seal.gi_at_seal : 0.93;
  const replayResults = events.map((e) => {
    const mii = typeof e.mii === 'number' ? e.mii : 0;
    const drift = Math.abs(mii - avgMii);
    return {
      id: e.id,
      title: e.title ?? '(untitled)',
      category: e.category,
      original_verdict: e.status,
      original_mii: mii || null,
      replay_verdict: mii >= 0.85 ? 'verified' : 'flagged',
      drift: Number(drift.toFixed(4)),
      confidence_tier: e.confidenceTier ?? null,
    };
  });

  const drifted = replayResults.filter((r) => r.drift > 0.05);
  const maxDrift = replayResults.length > 0
    ? Math.max(...replayResults.map((r) => r.drift))
    : 0;

  const quorumAgents = Object.entries(seal.attestations)
    .filter(([, att]) => att?.verdict === 'pass')
    .map(([agent]) => agent);

  return NextResponse.json({
    ok: true,
    seal_id: sealId,
    seal: {
      sequence: seal.sequence,
      status: seal.status,
      sealed_at: seal.sealed_at,
      cycle_at_seal: seal.cycle_at_seal,
      gi_at_seal: seal.gi_at_seal,
      seal_hash: seal.seal_hash ?? seal.prev_seal_hash,
      prev_seal_hash: seal.prev_seal_hash ?? null,
      substrate_attested: Boolean(seal.substrate_attestation_id),
      fountain_status: seal.fountain_status,
      quorum_agents: quorumAgents,
    },
    replay: {
      events: replayResults,
      total: replayResults.length,
      verified: replayResults.filter((r) => r.replay_verdict === 'verified').length,
      flagged: replayResults.filter((r) => r.replay_verdict === 'flagged').length,
      drifted: drifted.length,
      max_drift: Number(maxDrift.toFixed(4)),
      integrity_stable: drifted.length === 0,
    },
    timestamp: new Date().toISOString(),
  });
}
