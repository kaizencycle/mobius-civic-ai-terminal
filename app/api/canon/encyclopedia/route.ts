// C-340 — Canon Encyclopedia read surface.
// Returns attested knowledge Reserve Blocks. Defaults to verified-only because
// an encyclopedia shows knowledge that passed quorum, not drafts. Entries appear
// once the EVE-canonize → quorum → seal pipeline (Phase 2) writes them.

import { NextResponse } from 'next/server';
import { scanAndGet } from '@/lib/kv/scan';
import { KNOWLEDGE_KEY_PREFIX, type KnowledgeBlock, type KnowledgeStatus } from '@/lib/canon/knowledgeBlock';

export const dynamic = 'force-dynamic';

const SURFACEABLE: readonly KnowledgeStatus[] = ['attested', 'contested', 'superseded', 'refuted'];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const topic = url.searchParams.get('topic')?.toLowerCase() ?? null;
  const status = url.searchParams.get('status') ?? 'attested'; // verified-only by default
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 100) || 100, 1), 500);

  const rows = await scanAndGet<KnowledgeBlock>(`${KNOWLEDGE_KEY_PREFIX}*`, limit);
  let blocks = rows.map((r) => r.value).filter((b): b is KnowledgeBlock => Boolean(b));

  // Never surface drafts on the public encyclopedia — verified knowledge only.
  blocks = blocks.filter((b) => SURFACEABLE.includes(b.status));
  if (status !== 'all') blocks = blocks.filter((b) => b.status === status);
  if (topic) blocks = blocks.filter((b) => b.topic.toLowerCase().includes(topic) || b.claim.toLowerCase().includes(topic));

  blocks.sort((a, b) => (b.sealed_at ?? '').localeCompare(a.sealed_at ?? ''));

  return NextResponse.json(
    {
      ok: true,
      count: blocks.length,
      status,
      blocks,
      note: 'C-340 scaffold — read surface is live; entries appear once the canonize → quorum → seal pipeline (Phase 2) writes attested knowledge blocks.',
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
        'X-Mobius-Source': 'canon-encyclopedia',
      },
    },
  );
}
