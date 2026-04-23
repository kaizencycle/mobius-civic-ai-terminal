import { NextResponse } from 'next/server';
import { AdapterRegistry } from '@/packages/adapters/AdapterRegistry';
import { BotsOfWallStreetAdapter } from '@/packages/adapters/bots-of-wall-street/BotsOfWallStreetAdapter';
import { MoltbookAdapter } from '@/packages/adapters/moltbook/MoltbookAdapter';
import {
  mockBotsOfWallStreetSignals,
  mockMoltbookSignals,
  mockOpenClawSignals,
} from '@/packages/adapters/mock/mockSignals';
import { OpenClawAdapter } from '@/packages/adapters/openclaw/OpenClawAdapter';
import { addCandidates } from '@/lib/epicon/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const registry = new AdapterRegistry();

  registry.register(new OpenClawAdapter());
  registry.register(new MoltbookAdapter());
  registry.register(new BotsOfWallStreetAdapter());

  const botsOfWallStreet = await registry.ingestFrom(
    'bots_of_wall_street',
    mockBotsOfWallStreetSignals,
  );
  const moltbook = await registry.ingestFrom('moltbook', mockMoltbookSignals);
  const openclaw = await registry.ingestFrom('openclaw', mockOpenClawSignals);

  const totalCandidates = [botsOfWallStreet, moltbook, openclaw].reduce(
    (sum, item) => sum + item.candidates.length,
    0,
  );

  const allCandidates = [
    ...botsOfWallStreet.candidates,
    ...moltbook.candidates,
    ...openclaw.candidates,
  ].map((candidate) => ({
    title: candidate.title,
    summary: candidate.summary,
    category: candidate.category,
    confidence_tier: candidate.confidence_tier,
    sources: candidate.sources,
    tags: candidate.tags,
    trace: candidate.trace,
    external_source_system: candidate.external_source_system,
    external_source_actor: candidate.external_source_actor,
    zeus_note: undefined,
  }));

  addCandidates(allCandidates);

  return NextResponse.json({
    ok: true,
    agent: 'ECHO',
    action: 'adapter_ingest_simulation',
    adapters: registry.list().map((adapter) => ({
      id: adapter.id,
      sourceSystem: adapter.sourceSystem,
    })),
    totals: {
      signals:
        botsOfWallStreet.signals.length + moltbook.signals.length + openclaw.signals.length,
      candidates: totalCandidates,
    },
    result: {
      bots_of_wall_street: botsOfWallStreet,
      moltbook,
      openclaw,
    },
  });
}
