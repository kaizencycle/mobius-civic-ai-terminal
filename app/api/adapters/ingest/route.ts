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
