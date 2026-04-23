import {
  type DataSourceConfig,
  type IngestedSignal,
  type IntegritySignal,
  type SignalType,
} from '@/lib/ingestion/types';

const DEFAULT_SSE_RECONNECT_MS = Number(process.env.NEXT_PUBLIC_SSE_RECONNECT_MS ?? 5000);
const DEFAULT_SSE_MAX_BACKOFF_MS = Number(process.env.NEXT_PUBLIC_SSE_MAX_BACKOFF_MS ?? 60_000);
const DEFAULT_SSE_CIRCUIT_THRESHOLD = Number(process.env.NEXT_PUBLIC_SSE_CIRCUIT_THRESHOLD ?? 5);
const DEFAULT_SSE_CIRCUIT_COOLDOWN_MS = Number(process.env.NEXT_PUBLIC_SSE_CIRCUIT_COOLDOWN_MS ?? 60_000);
const DEFAULT_SSE_JITTER_MAX_MS = Number(process.env.NEXT_PUBLIC_SSE_JITTER_MAX_MS ?? 1000);
const DEFAULT_POLL_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS ?? 30000);
const SNAPSHOT_POLL_MS = Number(process.env.NEXT_PUBLIC_TERMINAL_SNAPSHOT_POLL_MS ?? 0);

export type SseConnectionStatus = 'connecting' | 'live' | 'degraded' | 'circuit_open';

export type SseStatusDetail = {
  source: string;
  status: SseConnectionStatus;
  attempt?: number;
  nextRetryMs?: number;
};

function resolveSseRetry(config: DataSourceConfig) {
  const r = config.retryConfig;
  return {
    baseMs: Math.max(500, r.backoffMs),
    maxMs: Math.max(r.backoffMs, r.maxBackoffMs ?? DEFAULT_SSE_MAX_BACKOFF_MS),
    circuitThreshold: Math.max(1, r.circuitBreakerThreshold ?? DEFAULT_SSE_CIRCUIT_THRESHOLD),
    circuitCooldownMs: Math.max(1000, r.circuitCooldownMs ?? DEFAULT_SSE_CIRCUIT_COOLDOWN_MS),
    jitterMaxMs: Math.max(0, r.jitterMaxMs ?? DEFAULT_SSE_JITTER_MAX_MS),
  };
}

function randomJitter(maxMs: number): number {
  if (maxMs <= 0) return 0;
  return Math.floor(Math.random() * (maxMs + 1));
}

type SseRuntime = {
  consecutiveErrors: number;
  circuitOpenUntil: number;
  reconnectTimer: number | null;
};

export class MobiusDataClient {
  private readonly sources: Map<string, DataSourceConfig> = new Map();
  private readonly eventSources: Map<string, EventSource> = new Map();
  private readonly pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private readonly sseRuntime: Map<string, SseRuntime> = new Map();

  public readonly signalBus = new EventTarget();

  constructor() {
    this.registerDefaultSources();
  }

  private emitSseStatus(source: string, status: SseConnectionStatus, extra?: Partial<Omit<SseStatusDetail, 'source' | 'status'>>) {
    const detail: SseStatusDetail = { source, status, ...extra };
    this.signalBus.dispatchEvent(new CustomEvent<SseStatusDetail>('sse:status', { detail }));
  }

  private sseMeta(name: string): SseRuntime {
    let row = this.sseRuntime.get(name);
    if (!row) {
      row = { consecutiveErrors: 0, circuitOpenUntil: 0, reconnectTimer: null };
      this.sseRuntime.set(name, row);
    }
    return row;
  }

  private clearSseReconnect(name: string) {
    const meta = this.sseRuntime.get(name);
    if (meta?.reconnectTimer) {
      window.clearTimeout(meta.reconnectTimer);
      meta.reconnectTimer = null;
    }
  }

  private registerDefaultSources() {
    const sseRetry = {
      maxRetries: 1000,
      backoffMs: DEFAULT_SSE_RECONNECT_MS,
      maxBackoffMs: DEFAULT_SSE_MAX_BACKOFF_MS,
      circuitBreakerThreshold: DEFAULT_SSE_CIRCUIT_THRESHOLD,
      circuitCooldownMs: DEFAULT_SSE_CIRCUIT_COOLDOWN_MS,
      jitterMaxMs: DEFAULT_SSE_JITTER_MAX_MS,
    };

    this.registerSource({
      name: 'terminal-api',
      baseUrl: process.env.NEXT_PUBLIC_TERMINAL_API_BASE ?? 'http://localhost:8000/api/v1',
      type: 'sse',
      retryConfig: sseRetry,
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
      retryConfig: sseRetry,
    });

    if (typeof window !== 'undefined' && Number.isFinite(SNAPSHOT_POLL_MS) && SNAPSHOT_POLL_MS > 0) {
      this.registerSource({
        name: 'terminal-snapshot',
        baseUrl: window.location.origin,
        type: 'poll',
        retryConfig: { maxRetries: 3, backoffMs: 1000 },
      });
    }
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
        this.startPolling(name, config, name === 'terminal-snapshot' ? SNAPSHOT_POLL_MS : DEFAULT_POLL_INTERVAL_MS);
        break;
      default:
        break;
    }
  }

  private connectSSE(name: string, config: DataSourceConfig) {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    const meta = this.sseMeta(name);
    const retry = resolveSseRetry(config);
    const url = this.getStreamUrl(name, config);

    this.clearSseReconnect(name);

    const now = Date.now();
    if (meta.circuitOpenUntil > now) {
      const wait = meta.circuitOpenUntil - now;
      this.emitSseStatus(name, 'circuit_open', { nextRetryMs: wait });
      meta.reconnectTimer = window.setTimeout(() => {
        meta.reconnectTimer = null;
        meta.circuitOpenUntil = 0;
        this.connectSSE(name, config);
      }, wait);
      return;
    }

    const prev = this.eventSources.get(name);
    if (prev) {
      prev.close();
      this.eventSources.delete(name);
    }

    this.emitSseStatus(name, 'connecting');

    let es: EventSource;
    try {
      es = new EventSource(url);
    } catch {
      this.scheduleSseReconnect(name, config, 'EventSource constructor failed');
      return;
    }

    this.eventSources.set(name, es);

    es.onopen = () => {
      meta.consecutiveErrors = 0;
      meta.circuitOpenUntil = 0;
      this.emitSseStatus(name, 'live');
    };

    es.onmessage = (event) => {
      meta.consecutiveErrors = 0;
      try {
        const data = JSON.parse(event.data) as unknown;
        this.processSignal(name, data);
      } catch (error) {
        console.error(`[${name}] Parse error`, error);
      }
    };

    es.onerror = () => {
      es.close();
      this.eventSources.delete(name);
      meta.consecutiveErrors += 1;
      this.emitSseStatus(name, 'degraded', { attempt: meta.consecutiveErrors });

      if (meta.consecutiveErrors >= retry.circuitThreshold) {
        meta.circuitOpenUntil = Date.now() + retry.circuitCooldownMs;
        meta.consecutiveErrors = 0;
        this.emitSseStatus(name, 'circuit_open', { nextRetryMs: retry.circuitCooldownMs });
        this.scheduleSseReconnect(name, config, undefined, retry.circuitCooldownMs);
        return;
      }

      const exp = Math.min(retry.baseMs * 2 ** (meta.consecutiveErrors - 1), retry.maxMs);
      const delay = exp + randomJitter(retry.jitterMaxMs);
      this.scheduleSseReconnect(name, config, undefined, delay);
    };
  }

  private scheduleSseReconnect(name: string, config: DataSourceConfig, _reason?: string, delayMs?: number) {
    const meta = this.sseMeta(name);
    this.clearSseReconnect(name);
    const retry = resolveSseRetry(config);
    const delay = Math.max(0, delayMs ?? retry.baseMs);

    meta.reconnectTimer = window.setTimeout(() => {
      meta.reconnectTimer = null;
      this.connectSSE(name, config);
    }, delay);
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

  private getStreamUrl(_name: string, config: DataSourceConfig): string {
    return `${config.baseUrl}/stream/events`;
  }

  private getEndpointsForSource(name: string): string[] {
    const endpointMap: Record<string, string[]> = {
      'terminal-api': ['/agents/status', '/epicon/feed', '/integrity/current', '/tripwires/active'],
      'civic-ledger': ['/epicon/record', '/epicon/attestations', '/ledger/history'],
      'gi-aggregator': ['/gi/current', '/gi/factors'],
      'thought-broker': ['/sentinels/status', '/consensus/active'],
      'terminal-snapshot': ['/api/terminal/snapshot'],
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
    if (endpoint?.includes('terminal/snapshot')) return 'integrity';
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
      'terminal-snapshot': 0.85,
      external: 0.6,
    };

    return sourceConfidence[source] ?? 0.5;
  }

  private hashRawData(raw: unknown): string {
    const serialized = JSON.stringify(raw);
    try {
      const bytes = new TextEncoder().encode(serialized);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
        return window.btoa(binary).slice(0, 16);
      }
      if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64').slice(0, 16);
      }
      let h = 2166136261;
      for (let i = 0; i < serialized.length; i++) {
        h ^= serialized.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return `fnv${(h >>> 0).toString(16)}`.slice(0, 16);
    } catch {
      return 'hash-failed';
    }
  }

  private numberOrDefault(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  disconnectAll() {
    for (const name of this.sources.keys()) {
      if (this.sources.get(name)?.type === 'sse') {
        this.clearSseReconnect(name);
      }
    }
    this.eventSources.forEach((source) => source.close());
    this.pollingIntervals.forEach((interval) => clearInterval(interval));
    this.eventSources.clear();
    this.pollingIntervals.clear();
  }
}
