import { NextRequest, NextResponse } from 'next/server';
import { AGENT_MANIFESTS } from '@/lib/agents/manifests';

export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const key = name.toUpperCase() as keyof typeof AGENT_MANIFESTS;
    const agent = AGENT_MANIFESTS[key] ?? null;
    return NextResponse.json({ ok: true, agent, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'inspect failed' }, { status: 200 });
  }
}
