import { NextResponse } from 'next/server';
import { isSealEligible } from '@/lib/seal/eligibility';
import { getTrancheState } from '@/lib/seal/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tranche = await getTrancheState();
  const eligibility = isSealEligible(tranche);

  return NextResponse.json({
    eligible: eligibility.eligible,
    tranche_id: tranche.tranche_id,
    current_units: tranche.current_units,
    target_units: tranche.target_units,
    remaining: eligibility.remaining,
  });
}
