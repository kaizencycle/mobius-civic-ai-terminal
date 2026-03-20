import { NextResponse } from 'next/server';
import { ledgerBackfill } from '@/lib/mock/ledgerBackfill';

export async function GET() {
  return NextResponse.json({
    ok: true,
    count: ledgerBackfill.length,
    items: ledgerBackfill,
  });
}
