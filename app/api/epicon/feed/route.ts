import { NextResponse } from 'next/server';
import { getPublicEpiconFeed } from '@/lib/epicon/feedStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const items = getPublicEpiconFeed();

  return NextResponse.json({
    ok: true,
    count: items.length,
    items,
  });
}
