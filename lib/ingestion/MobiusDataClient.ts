import {
  type DataSourceConfig,
  type IngestedSignal,
  type IntegritySignal,
  type SignalType,
} from '@/lib/ingestion/types';

const DEFAULT_SSE_RECONNECT_MS = Number(process.env.NEXT_PUBLIC_SSE_RECONNECT_MS ?? 5000);
const DEFAULT_POLL_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS ?? 30000);

export class MobiusDataClient {
  private readonly sources: Map<string, DataSourceConfig> = new Map();
  private readonly eventSources: Map<string, EventSource> = new Map();
  private readonly pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  public readonly signalBus = new EventTarget();

  constructor() {
    this.registerDefaultSources();
  }

  private registerDefaultSources() {
    this.registerSource({
      name: 'terminal-api',
      baseUrl: process.env.NEXT_PUBLIC_TERMINAL_API_BASE ?? 'http://localhost:8000/api/v1',
      type: 'sse',
      retryConfig: { maxRetries: 5, backoffMs: DEFAULT_SSE_RECONNECT_MS },
    });

    this.registerSource({
      name: 'civic-ledger',
      baseUrl: process.env.NEXT_PUBLIC_LEDGER_URL ?? 'http://localhost:3000',
      type: 'rest',
      retryConfig: { maxRetries: 3, backoffMs: 500 },
    });

    this.registerSource({
      name: 'gi-aggregator',
      baseUrl: process.env.NEXT_PUBLIC_GI_URL ?? 'http://localhost:3001',
      type: 'poll',
      retryConfig: { maxRetries: 3, backoffMs: 500 },
    });

    this.registerSource({
      name: 'thought-broker',
      baseUrl: process.env.NEXT_PUBLIC_BROKER_URL ?? 'http://localhost:4005',
      type: 'sse',
      retryConfig: { maxRetries: 5, backoffMs: DEFAULT_SSE_RECONNECT_MS },
    });
  }

  registerSource(config: DataSourceConfig) {
    this.sources.set(config.name, config);
  }

  async connectAll() {
    for (const [name, config] of this.sources.entries()) {
      await this.connectSource(name, config);
    }
  }

  private async connectSource(name: string, config: DataSourceConfig) {
    switch (config.type) {
      case 'sse':
        this.connectSSE(name, config);
        break;
      case 'rest':
        this.startPolling(name, config, 5000);
        break;
      case 'poll':
        this.startPolling(name, config, DEFAULT_POLL_INTERVAL_MS);
        break;
      default:
        break;
    }
  }

  private connectSSE(name: string, config: DataSourceConfig, attempts = 0) {
    const url = this.getStreamUrl(name, config);
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as unknown;
        this.processSignal(name, data);
      } catch (error) {
        console.error(`[${name}] Parse error`, error);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();

      if (attempts >= config.retryConfig.maxRetries) {
        console.error(`[${name}] SSE retry limit reached`);
        return;
      }

      window.setTimeout(
        () => this.connectSSE(name, config, attempts + 1),
        config.retryConfig.backoffMs,
      );
    };

    this.eventSources.set(name, eventSource);
  }

  private startPolling(name: string, config: DataSourceConfig, intervalMs: number) {
    const poll = async () => {
      try {
        const endpoints = this.getEndpointsForSource(name);
        for (const endpoint of endpoints) {
          const response = await fetch(`${config.baseUrl}${endpoint}`);
          if (!response.ok) continue;

          const data = (await response.json()) as unknown;
          this.processSignal(name, data, endpoint);
        }
      } catch (error) {
        console.error(`[${name}] Poll error`, error);
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, intervalMs);
    this.pollingIntervals.set(name, interval);
  }

  private getStreamUrl(name: string, config: DataSourceConfig): string {
    if (name === 'terminal-api') {
      return `${config.baseUrl}/stream/events`;
    }

    return `${config.baseUrl}/stream/events`;
  }

  private getEndpointsForSource(name: string): string[] {
    const endpointMap: Record<string, string[]> = {
      'terminal-api': ['/agents/status', '/epicon/feed', '/integrity/current', '/tripwires/active'],
      'civic-ledger': ['/epicon/record', '/epicon/attestations', '/ledger/history'],
      'gi-aggregator': ['/gi/current', '/gi/factors'],
      'thought-broker': ['/sentinels/status', '/consensus/active'],
    };

    return endpointMap[name] ?? ['/'];
  }

  private processSignal(source: string, raw: unknown, endpoint?: string) {
    const signal: IngestedSignal = {
      id: `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      timestamp: new Date(),
      source,
      type: this.classifySignal(endpoint),
      raw,
      processed: this.transformToIntegritySignal(source, raw),
      confidence: this.calculateConfidence(source),
    };

    this.signalBus.dispatchEvent(new CustomEvent<IngestedSignal>('signal', { detail: signal }));
    this.signalBus.dispatchEvent(new CustomEvent<IngestedSignal>(`signal:${signal.type}`, { detail: signal }));
  }

  private classifySignal(endpoint?: string): SignalType {
    if (endpoint?.includes('epicon')) return 'epicon';
    if (endpoint?.includes('agent')) return 'agent';
    if (endpoint?.includes('integrity') || endpoint?.includes('gi')) return 'integrity';
    if (endpoint?.includes('tripwire')) return 'threat';
    if (endpoint?.includes('sentinel') || endpoint?.includes('consensus')) return 'consensus';
    if (endpoint?.includes('wallet') || endpoint?.includes('mic')) return 'economy';

    return 'sentiment';
  }

  private transformToIntegritySignal(source: string, raw: unknown): IntegritySignal {
    const payload = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

    const sourceReliability = this.numberOrDefault(payload.sourceReliability ?? payload.confidence, 0.5);
    const institutionalTrust = this.numberOrDefault(payload.institutionalTrust ?? payload.trustScore, 0.5);
    const consensusStability = this.numberOrDefault(payload.consensusStability ?? payload.consensus, 0.5);
    const narrativeDivergence = this.numberOrDefault(payload.narrativeDivergence ?? payload.divergence, 0);

    return {
      sourceReliability,
      institutionalTrust,
      consensusStability,
      narrativeDivergence,
      giContribution: this.calculateGIContribution({
        sourceReliability,
        institutionalTrust,
        consensusStability,
        narrativeDivergence,
      }),
      provenance: {
        source,
        timestamp: new Date(),
        rawHash: this.hashRawData(raw),
      },
    };
  }

  private calculateGIContribution(input: {
    sourceReliability: number;
    institutionalTrust: number;
    consensusStability: number;
    narrativeDivergence: number;
  }) {
    const weights = {
      sourceReliability: 0.3,
      institutionalTrust: 0.3,
      consensusStability: 0.25,
      narrativeDivergence: 0.15,
    };

    return (
      input.sourceReliability * weights.sourceReliability +
      input.institutionalTrust * weights.institutionalTrust +
      input.consensusStability * weights.consensusStability +
      (1 - input.narrativeDivergence) * weights.narrativeDivergence
    );
  }

  private calculateConfidence(source: string): number {
    const sourceConfidence: Record<string, number> = {
      'terminal-api': 0.9,
      'civic-ledger': 0.95,
      'gi-aggregator': 0.92,
      'thought-broker': 0.88,
      external: 0.6,
    };

    return sourceConfidence[source] ?? 0.5;
  }

  private hashRawData(raw: unknown): string {
    const serialized = JSON.stringify(raw);

    if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
      return window.btoa(serialized).slice(0, 16);
    }

    return Buffer.from(serialized).toString('base64').slice(0, 16);
  }

  private numberOrDefault(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  disconnectAll() {
    this.eventSources.forEach((source) => source.close());
    this.pollingIntervals.forEach((interval) => clearInterval(interval));
    this.eventSources.clear();
    this.pollingIntervals.clear();
  }
}
