import { NextResponse } from 'next/server';
import { buildWeeklyDigest } from '@/lib/digest/weekly';

export async function GET() {
  return NextResponse.json({
    ok: true,
    digest: buildWeeklyDigest(),
  });
}
