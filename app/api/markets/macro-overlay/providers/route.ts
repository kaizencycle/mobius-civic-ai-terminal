import { NextResponse } from 'next/server';
import { getSupportedMacroProviders } from '@/lib/markets/macro-providers';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    active: process.env.MARKET_MACRO_PROVIDER ?? 'generic',
    providers: getSupportedMacroProviders(),
  });
}
