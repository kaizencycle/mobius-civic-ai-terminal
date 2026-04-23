import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { attestAtlas } from '@/lib/seal/attestAtlas';
import { attestHermes } from '@/lib/seal/attestHermes';
import { attestZeus } from '@/lib/seal/attestZeus';
import { buildSealRecord } from '@/lib/seal/buildSeal';
import { isSealEligible } from '@/lib/seal/eligibility';
import { issueSeal } from '@/lib/seal/issueSeal';
import { rollForwardTranche } from '@/lib/seal/rollForward';
import { getSealByTrancheId, getTrancheState, persistSeal, persistTranche } from '@/lib/seal/store';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return false;
  return token === process.env.SEAL_TOKEN;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const tranche = await getTrancheState();
  const existingSeal = await getSealByTrancheId(tranche.tranche_id);
  if (existingSeal) {
    return NextResponse.json({ ok: true, reason: 'already_sealed', seal: existingSeal });
  }

  const { eligible, remaining } = isSealEligible(tranche);
  if (!eligible) {
    return NextResponse.json({ ok: false, reason: 'not_eligible', remaining });
  }

  const zeus = await attestZeus(tranche.tranche_id);
  if (zeus.status !== 'pass') {
    return NextResponse.json({ ok: false, reason: 'zeus_failed', zeus });
  }

  const atlas = await attestAtlas(tranche.tranche_id);
  if (atlas.status !== 'pass') {
    return NextResponse.json({ ok: false, reason: 'atlas_failed', atlas });
  }

  const hermes = await attestHermes(tranche.tranche_id);
  if (hermes.status !== 'pass') {
    return NextResponse.json({ ok: false, reason: 'hermes_failed', hermes });
  }

  const seal = buildSealRecord({
    sealId: `seal-${Date.now()}`,
    trancheId: tranche.tranche_id,
    cycle: tranche.cycle_opened,
    units: tranche.target_units,
    attestation: { zeus, atlas, hermes },
  });

  const issued = await issueSeal(seal);
  if (!issued.ok) {
    return NextResponse.json({ ...issued }, { status: 502 });
  }

  await persistSeal(seal);

  const rolled = rollForwardTranche({
    sealedReserveTotal: tranche.sealed_reserve_total,
    currentUnits: tranche.current_units,
    targetUnits: tranche.target_units,
  });

  const nextTranche = {
    tranche_id: `tranche-${Date.now()}`,
    cycle_opened: tranche.cycle_opened,
    current_units: rolled.next_tranche_units,
    target_units: rolled.next_tranche_target,
    sealed: false,
    sealed_reserve_total: rolled.sealed_reserve_total,
  };

  await persistTranche(nextTranche);

  return NextResponse.json({ ok: true, seal, next: nextTranche });
}
