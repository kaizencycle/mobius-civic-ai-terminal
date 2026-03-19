import { NextResponse } from 'next/server';
import { getCandidates } from '@/lib/epicon/store';

export async function GET() {
  return NextResponse.json({
    ok: true,
    candidates: getCandidates(),
  });
}
