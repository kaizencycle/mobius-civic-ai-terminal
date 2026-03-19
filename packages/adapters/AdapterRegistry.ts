import type {
  ExternalSignal,
  NormalizedEpiconCandidate,
  SourceAdapter,
} from './types';

export class AdapterRegistry {
  private adapters = new Map<string, SourceAdapter>();

  register(adapter: SourceAdapter) {
    this.adapters.set(adapter.sourceSystem, adapter);
  }

  get(sourceSystem: string): SourceAdapter | undefined {
    return this.adapters.get(sourceSystem);
  }

  list(): SourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  async ingestFrom(
    sourceSystem: string,
    input: unknown,
  ): Promise<{
    signals: ExternalSignal[];
    candidates: NormalizedEpiconCandidate[];
  }> {
    const adapter = this.get(sourceSystem);

    if (!adapter) {
      throw new Error(`No adapter registered for source system: ${sourceSystem}`);
    }

    const signals = await adapter.ingest(input);
    const normalized = await Promise.all(signals.map((signal) => adapter.normalize(signal)));

    return {
      signals,
      candidates: normalized.filter(
        (candidate): candidate is NormalizedEpiconCandidate => candidate !== null,
      ),
    };
  }
}
