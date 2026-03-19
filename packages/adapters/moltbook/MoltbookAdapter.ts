import type {
  EpiconCompatibleCategory,
  ExternalSignal,
  ExternalSignalCategory,
  NormalizedEpiconCandidate,
  SourceAdapter,
} from '../types';

type MoltbookSignalInput = {
  id: string;
  actor?: string;
  title: string;
  body: string;
  topic?: string;
  created_at: string;
  url?: string;
  tags?: string[];
};

function inferCategory(topic?: string): ExternalSignalCategory {
  if (!topic) {
    return 'narrative';
  }

  const normalized = topic.toLowerCase();

  if (normalized.includes('market')) {
    return 'narrative';
  }

  if (normalized.includes('geo')) {
    return 'geopolitical';
  }

  if (normalized.includes('govern')) {
    return 'governance';
  }

  if (normalized.includes('infra')) {
    return 'infrastructure';
  }

  return 'narrative';
}

function toEpiconCategory(
  category: ExternalSignalCategory,
  topic?: string,
): EpiconCompatibleCategory {
  if (category !== 'narrative') {
    return category;
  }

  return topic?.toLowerCase().includes('market') ? 'market' : 'geopolitical';
}

export class MoltbookAdapter implements SourceAdapter {
  readonly id = 'moltbook-adapter';
  readonly sourceSystem = 'moltbook';

  async ingest(input: unknown): Promise<ExternalSignal[]> {
    const items = Array.isArray(input) ? (input as MoltbookSignalInput[]) : [];

    return items.map((item) => ({
      external_id: item.id,
      source_system: this.sourceSystem,
      source_actor: item.actor,
      observed_at: item.created_at,
      category: inferCategory(item.topic),
      title: item.title,
      summary: item.body,
      raw_payload: item,
      source_url: item.url,
      tags: item.tags,
    }));
  }

  async normalize(signal: ExternalSignal): Promise<NormalizedEpiconCandidate | null> {
    const rawInput = signal.raw_payload as MoltbookSignalInput;

    return {
      title: signal.title,
      summary: signal.summary,
      category: toEpiconCategory(signal.category, rawInput.topic),
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
