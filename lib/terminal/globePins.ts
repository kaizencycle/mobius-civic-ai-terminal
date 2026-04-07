import type { MicroSignal } from '@/lib/agents/micro/core';
import type { EpiconItem } from '@/lib/terminal/types';

export type GlobePinSeverity = 'nominal' | 'elevated' | 'critical';

export type GlobePin = {
  id: string;
  lat: number;
  lng: number;
  source: string;
  title: string;
  value: number;
  severity: GlobePinSeverity;
  agent: string;
  meta: Record<string, string | number | boolean | null>;
  pulse: boolean;
  domainKey: SentimentDomainKey;
};

export type SentimentDomainKey =
  | 'civic'
  | 'environ'
  | 'financial'
  | 'narrative'
  | 'infrastructure'
  | 'institutional';

const DC: [number, number] = [38.9, -77.0];
const DC_DATAGOV: [number, number] = [38.9, -77.05];
const SF: [number, number] = [37.4, -122.1];
const SF_GH: [number, number] = [37.4, -122.4];
const NYC: [number, number] = [40.7, -74.0];
const LONDON: [number, number] = [51.5, -0.12];
const WIKI: [number, number] = [0, 20];
const NPM_GLOBAL: [number, number] = [0, -30];

function microSeverityToGlobe(s: MicroSignal['severity']): GlobePinSeverity {
  if (s === 'critical') return 'critical';
  if (s === 'elevated' || s === 'watch') return 'elevated';
  return 'nominal';
}

function echoSeverityToGlobe(s: string): GlobePinSeverity {
  const x = s.toLowerCase();
  if (x === 'high' || x === 'critical') return 'critical';
  if (x === 'medium' || x === 'elevated') return 'elevated';
  return 'nominal';
}

function agentLabel(agentName: string): string {
  if (agentName === 'HERMES-µ') return 'HERMES';
  if (agentName === 'DAEDALUS-µ') return 'DAEDALUS';
  return agentName;
}

function sourceDomain(source: string): SentimentDomainKey {
  const s = source.toLowerCase();
  if (s.includes('federal register') || s.includes('fr ')) return 'civic';
  if (
    s.includes('usgs')
    || s.includes('open-meteo')
    || s.includes('eonet')
    || s.includes('nasa')
  ) {
    return 'environ';
  }
  if (s.includes('coingecko') || s.includes('bitcoin') || s.includes('ethereum') || s.includes('solana')) {
    return 'financial';
  }
  if (s.includes('hacker') || s.includes('wikipedia') || s.includes('gdelt') || s.includes('sonar')) {
    return 'narrative';
  }
  if (s.includes('github') || s.includes('npm') || s.includes('self-ping')) return 'infrastructure';
  if (s.includes('data.gov')) return 'institutional';
  return 'infrastructure';
}

type MicroSweepLike = {
  allSignals?: MicroSignal[];
};

function pushPin(
  pins: GlobePin[],
  seen: Set<string>,
  pin: Omit<GlobePin, 'pulse'> & { pulse?: boolean },
) {
  if (seen.has(pin.id)) return;
  seen.add(pin.id);
  const pulse =
    pin.pulse ?? (pin.severity === 'elevated' || pin.severity === 'critical');
  pins.push({ ...pin, pulse });
}

/**
 * Derive globe pins from `/api/signals/micro` and optional ECHO EPICON items
 * (`epicon` array from `/api/echo/feed`, with `echoIngest` from the transform layer).
 */
export function buildGlobePinsFromMicro(
  micro: MicroSweepLike | null,
  echoEpicon: EpiconItem[] | null,
): GlobePin[] {
  const pins: GlobePin[] = [];
  const seen = new Set<string>();

  for (const sig of micro?.allSignals ?? []) {
    const agent = agentLabel(sig.agentName);
    const domainKey = sourceDomain(sig.source);
    const sev = microSeverityToGlobe(sig.severity);

    if (sig.source === 'USGS Earthquake') {
      const raw = sig.raw as
        | {
            samples?: Array<{ mag: number; place: string; lat: number | null; lng: number | null }>;
            count?: number;
            maxMag?: number;
          }
        | undefined;
      const samples = raw?.samples?.filter((q) => q.lat != null && q.lng != null) ?? [];
      if (samples.length > 0) {
        for (let i = 0; i < samples.length; i++) {
          const q = samples[i];
          const id = `usgs-${i}-${q.lat!.toFixed(2)}-${q.lng!.toFixed(2)}`;
          const magNorm = Math.max(0, Math.min(1, 1 - (q.mag - 2.5) / 5.5));
          pushPin(pins, seen, {
            id,
            lat: q.lat!,
            lng: q.lng!,
            source: `${agent} · USGS Earthquake`,
            title: `M ${q.mag.toFixed(1)} — ${q.place}`,
            value: magNorm,
            severity: q.mag >= 5.5 ? 'critical' : q.mag >= 4 ? 'elevated' : sev,
            agent,
            domainKey,
            meta: {
              mag: q.mag,
              place: q.place,
              region: q.place,
              sweepCount: raw?.count ?? samples.length,
            },
          });
        }
        continue;
      }
      pushPin(pins, seen, {
        id: 'usgs-aggregate',
        lat: 20,
        lng: -100,
        source: `${agent} · USGS Earthquake`,
        title: sig.label,
        value: sig.value,
        severity: sev,
        agent,
        domainKey,
        meta: { note: 'aggregate (no per-event coordinates)' },
      });
      continue;
    }

    if (sig.source === 'NASA EONET') {
      const raw = sig.raw as
        | {
            samples?: Array<{ id: string; title: string; lat: number; lng: number; category: string }>;
            count?: number;
          }
        | undefined;
      const samples = raw?.samples ?? [];
      if (samples.length > 0) {
        for (const ev of samples) {
          pushPin(pins, seen, {
            id: `eonet-${ev.id}`,
            lat: ev.lat,
            lng: ev.lng,
            source: `${agent} · NASA EONET`,
            title: ev.title,
            value: sig.value,
            severity: sev,
            agent,
            domainKey,
            meta: { category: ev.category, openEvents: raw?.count ?? samples.length },
          });
        }
        continue;
      }
    }

    let lat: number;
    let lng: number;
    if (sig.source === 'Federal Register') {
      [lat, lng] = DC;
    } else if (sig.source.startsWith('data.gov') || sig.source === 'data.gov') {
      [lat, lng] = DC_DATAGOV;
    } else if (sig.source === 'Hacker News') {
      [lat, lng] = SF;
    } else if (sig.source === 'Wikipedia Recent Changes') {
      [lat, lng] = WIKI;
    } else if (sig.source === 'Open-Meteo') {
      [lat, lng] = NYC;
    } else if (sig.source === 'GitHub API') {
      [lat, lng] = SF_GH;
    } else if (sig.source === 'npm Registry') {
      [lat, lng] = NPM_GLOBAL;
    } else {
      [lat, lng] = [15, 0];
    }

    const id = `micro-${sig.source.replace(/\s+/g, '-').toLowerCase()}-${sig.timestamp.slice(0, 13)}`;
    pushPin(pins, seen, {
      id,
      lat,
      lng,
      source: `${agent} · ${sig.source}`,
      title: sig.label,
      value: sig.value,
      severity: sev,
      agent,
      domainKey,
      meta: flattenRaw(sig.raw),
    });
  }

  for (const item of echoEpicon ?? []) {
    const ingest = item.echoIngest;
    if (!ingest) continue;
    const src = ingest.source;
    // USGS quakes already come from micro with coordinates; CoinGecko only exists on ECHO ingest.
    if (src !== 'CoinGecko') continue;

    const meta = ingest.metadata ?? {};
    const coin = typeof meta.coin === 'string' ? meta.coin.toLowerCase() : '';
    let lat: number;
    let lng: number;
    if (coin === 'ethereum') {
      [lat, lng] = LONDON;
    } else if (coin === 'solana') {
      [lat, lng] = SF;
    } else {
      [lat, lng] = NYC;
    }

    const title = item.title ?? item.summary ?? src;
    const id = `echo-${item.id}`;
    const echoSev = echoSeverityToGlobe(ingest.severity);
    const change = typeof meta.change24h === 'number' ? meta.change24h : 0;
    const value = Math.max(0, Math.min(1, 1 - Math.min(1, Math.abs(change) / 12)));

    const agent = item.ownerAgent ?? 'ECHO';

    pushPin(pins, seen, {
      id,
      lat,
      lng,
      source: `${agent} · ${src}`,
      title,
      value,
      severity: echoSev,
      agent,
      domainKey: sourceDomain(src),
      meta: flattenRaw(meta),
    });
  }

  return pins;
}

function flattenRaw(raw: unknown): Record<string, string | number | boolean | null> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object') {
    return { value: String(raw) };
  }
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === undefined) {
      out[k] = null;
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = JSON.stringify(v).slice(0, 200);
    } else {
      out[k] = JSON.stringify(v).slice(0, 200);
    }
  }
  return out;
}

export const GLOBE_DOMAIN_ORDER: SentimentDomainKey[] = [
  'civic',
  'environ',
  'financial',
  'narrative',
  'infrastructure',
  'institutional',
];
