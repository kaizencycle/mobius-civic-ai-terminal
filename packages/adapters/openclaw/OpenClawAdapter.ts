import type {
  EpiconCompatibleCategory,
  ExternalSignal,
  ExternalSignalCategory,
  NormalizedEpiconCandidate,
  SourceAdapter,
} from '../types';

type OpenClawSignalInput = {
  id: string;
  agent?: string;
  type?: string;
  title: string;
  summary: string;
  timestamp: string;
  url?: string;
  payload?: unknown;
  tags?: string[];
};

function inferCategory(type?: string): ExternalSignalCategory {
  if (!type) {
    return 'infrastructure';
  }

  if (type.includes('market')) {
    return 'market';
  }

  if (type.includes('geo')) {
    return 'geopolitical';
  }

  if (type.includes('govern')) {
    return 'governance';
  }

  if (type.includes('narrative')) {
    return 'narrative';
  }

  return 'infrastructure';
}

function toEpiconCategory(category: ExternalSignalCategory): EpiconCompatibleCategory {
  if (category === 'narrative') {
    return 'infrastructure';
  }

  return category;
}

export class OpenClawAdapter implements SourceAdapter {
  readonly id = 'openclaw-adapter';
  readonly sourceSystem = 'openclaw';

  async ingest(input: unknown): Promise<ExternalSignal[]> {
    const items = Array.isArray(input) ? (input as OpenClawSignalInput[]) : [];

    return items.map((item) => ({
      external_id: item.id,
      source_system: this.sourceSystem,
      source_actor: item.agent,
      observed_at: item.timestamp,
      category: inferCategory(item.type),
      title: item.title,
      summary: item.summary,
      raw_payload: item,
      source_url: item.url,
      tags: item.tags,
    }));
  }

  async normalize(signal: ExternalSignal): Promise<NormalizedEpiconCandidate | null> {
    return {
      title: signal.title,
      summary: signal.summary,
      category: toEpiconCategory(signal.category),
      status: 'pending',
      confidence_tier: 1,
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
