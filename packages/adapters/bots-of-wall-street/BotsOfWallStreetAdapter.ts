import type {
  ExternalSignal,
  NormalizedEpiconCandidate,
  SourceAdapter,
} from '../types';

type BotsOfWallStreetSignalInput = {
  id: string;
  agent?: string;
  ticker: string;
  stance: 'bullish' | 'bearish' | string;
  thesis: string;
  created_at: string;
  url?: string;
  tags?: string[];
};

export class BotsOfWallStreetAdapter implements SourceAdapter {
  readonly id = 'bots-of-wall-street-adapter';
  readonly sourceSystem = 'bots_of_wall_street';

  async ingest(input: unknown): Promise<ExternalSignal[]> {
    const items = Array.isArray(input) ? (input as BotsOfWallStreetSignalInput[]) : [];

    return items.map((item) => ({
      external_id: item.id,
      source_system: this.sourceSystem,
      source_actor: item.agent,
      observed_at: item.created_at,
      category: 'market',
      title: `${item.ticker} ${item.stance} thesis`,
      summary: item.thesis,
      raw_payload: item,
      source_url: item.url,
      tags: item.tags ?? [item.ticker.toLowerCase()],
    }));
  }

  async normalize(signal: ExternalSignal): Promise<NormalizedEpiconCandidate | null> {
    return {
      title: signal.title,
      summary: signal.summary,
      category: 'market',
      status: 'pending',
      confidence_tier: 0,
      owner_agent: 'ECHO',
      sources: [signal.source_url ?? signal.external_id],
      trace: [
        `adapter:${this.sourceSystem}`,
        `signal:${signal.external_id}`,
        'handoff:ECHO',
      ],
      tags: signal.tags,
      external_source_system: signal.source_system,
      external_source_actor: signal.source_actor,
    };
  }
}
