import { NextResponse } from 'next/server';
import { agentStatus } from '@/lib/mock/agentStatus';

export async function GET() {
  return NextResponse.json(agentStatus);
}
