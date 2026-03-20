import { NextResponse } from 'next/server';
import { integrityStatus } from '@/lib/mock/integrityStatus';

export async function GET() {
  return NextResponse.json(integrityStatus);
}
