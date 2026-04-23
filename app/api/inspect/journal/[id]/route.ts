import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: false, error: 'Journal inspector is on-demand and unavailable in this environment.' }, { status: 200 });
}
