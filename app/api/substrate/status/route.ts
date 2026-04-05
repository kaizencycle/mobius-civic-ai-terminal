import { NextResponse } from 'next/server';
import { getSubstrateStatusSummary } from '@/lib/substrate/client';

export async function GET() {
  const status = await getSubstrateStatusSummary();
  const degraded = status.services.some((service) => !service.ok);

  return NextResponse.json({
    ok: true,
    degraded,
    ...status,
  });
}

