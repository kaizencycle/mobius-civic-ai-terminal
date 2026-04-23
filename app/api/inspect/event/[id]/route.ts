import { NextRequest, NextResponse } from 'next/server';
import { getPublicEpiconFeed } from '@/lib/epicon/feedStore';

export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const event = getPublicEpiconFeed().find((row) => row.id === id) ?? null;
    return NextResponse.json({ ok: true, event, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'inspect failed' }, { status: 200 });
  }
}
