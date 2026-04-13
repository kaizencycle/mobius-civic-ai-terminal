import type { MicroSignal } from '@/lib/agents/micro/core';
import type { EpiconItem } from '@/lib/terminal/types';
import type { GlobeVisualAsset } from '@/lib/globe/types';

export type GlobePinSeverity = 'nominal' | 'elevated' | 'critical';

export type GlobePin = {
  id: string;
  lat: number;
  lng: number;
  source: string;
  title: string;
  /** 0–1 confidence / signal strength (distinct from severity) */
  value: number;
  confidence: number;
  severity: GlobePinSeverity;
  agent: string;
  meta: Record<string, string | number | boolean | null>;
  pulse: boolean;
  domainKey: SentimentDomainKey;
  updatedAt: string;
  ageSec: number;
  provisional: boolean;
  /** Regional / investigative grouping (e.g. Pacific Rim seismic) */
  clusterKey: string | null;
  clusterLabel: string | null;
  provenance: string;
  narrativeWhy: string;
  visualAsset?: GlobeVisualAsset | null;
  /** Pin layer — 'epicon' renders as cyan, distinct from EONET orange/red pins */
  layer?: 'epicon';
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

type GlobePinInput = Pick<
  GlobePin,
  'id' | 'lat' | 'lng' | 'source' | 'title' | 'value' | 'severity' | 'agent' | 'meta' | 'domainKey'
> & {
  pulse?: boolean;
  confidence?: number;
  signalTimestamp?: string;
  clusterKey?: string | null;
  clusterLabel?: string | null;
  provenance?: string;
  narrativeWhy?: string;
  provisional?: boolean;
  visualAsset?: GlobeVisualAsset | null;
  layer?: 'epicon';
};

function seismicCluster(lat: number, lng: number): { key: string; label: string } | null {
  const pacificRim =
    (lng <= -70 && lng >= -180 && lat >= -55 && lat <= 72)
    || (lng >= 95 && lat >= -50 && lat <= 55)
    || (lng >= -180 && lng <= -90 && lat >= -60 && lat <= 35);
  if (pacificRim) return { key: 'pacific_rim_seismic', label: 'Pacific Rim seismic activity' };
  if (lat >= 25 && lat <= 50 && lng >= -15 && lng <= 40) return { key: 'europe_mena', label: 'Europe / MENA corridor' };
  return null;
}

function pushPin(pins: GlobePin[], seen: Set<string>, pin: GlobePinInput) {
  if (seen.has(pin.id)) return;
  seen.add(pin.id);
  const pulse =
    pin.pulse ?? (pin.severity === 'elevated' || pin.severity === 'critical');
  const confidence = typeof pin.confidence === 'number' ? pin.confidence : pin.value;
  const updatedAt = pin.signalTimestamp ?? new Date().toISOString();
  const ageSec = Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000));
  let clusterKey = pin.clusterKey ?? null;
  let clusterLabel = pin.clusterLabel ?? null;
  if (clusterKey == null && pin.source.includes('USGS')) {
    const c = seismicCluster(pin.lat, pin.lng);
    if (c) {
      clusterKey = c.key;
      clusterLabel = c.label;
    }
  }
  const provisional =
    pin.provisional
    ?? (pin.source.includes('Wikipedia') || pin.source.includes('npm Registry') || confidence < 0.45);
  const out: GlobePin = {
    id: pin.id,
    lat: pin.lat,
    lng: pin.lng,
    source: pin.source,
    title: pin.title,
    value: pin.value,
    severity: pin.severity,
    agent: pin.agent,
    meta: pin.meta,
    domainKey: pin.domainKey,
    pulse,
    confidence,
    ageSec,
    updatedAt,
    clusterKey,
    clusterLabel,
    provisional,
    provenance: pin.provenance ?? `${pin.agent} synthesis · ${pin.source}`,
    narrativeWhy:
      pin.narrativeWhy
      ?? `Elevated attention for ${pin.domainKey} lane — operators should verify against ledger and journal context.`,
  };
  if (pin.visualAsset !== undefined) out.visualAsset = pin.visualAsset;
  if (pin.layer !== undefined) out.layer = pin.layer;
  pins.push(out);
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
          const pinSev = q.mag >= 5.5 ? 'critical' : q.mag >= 4 ? 'elevated' : sev;
          pushPin(pins, seen, {
            id,
            lat: q.lat!,
            lng: q.lng!,
            source: `${agent} · USGS Earthquake`,
            title: `M ${q.mag.toFixed(1)} — ${q.place}`,
            value: magNorm,
            confidence: Math.min(1, 0.55 + (q.mag / 8) * 0.45),
            severity: pinSev,
            agent,
            domainKey,
            signalTimestamp: sig.timestamp,
            provenance: 'USGS public feed · GAIA micro-agent sweep',
            narrativeWhy:
              pinSev !== 'nominal'
                ? 'Seismic stress on globe — verify cascading civic and infrastructure risk if activity clusters persist.'
                : 'Background seismicity within sweep tolerance.',
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
        confidence: sig.value,
        severity: sev,
        agent,
        domainKey,
        signalTimestamp: sig.timestamp,
        provenance: 'USGS aggregate · GAIA sweep (no per-event coordinates)',
        narrativeWhy: 'Aggregate seismic lane — open inspection for sweep context.',
        provisional: true,
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
            confidence: Math.min(1, 0.5 + sig.value * 0.5),
            severity: sev,
            agent,
            domainKey,
            signalTimestamp: sig.timestamp,
            clusterKey: 'eonet_natural',
            clusterLabel: 'Global natural events (EONET)',
            provenance: 'NASA EONET · GAIA',
            narrativeWhy: 'Environmental hazard layer — cross-check with civic readiness and supply routes.',
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
    const prov =
      sig.source === 'Federal Register' || sig.source.startsWith('data.gov')
        ? 'Federal Register / data.gov · THEMIS sweep'
        : sig.source === 'Hacker News'
          ? 'Hacker News API · HERMES-µ'
          : `${agent} · ${sig.source}`;
    pushPin(pins, seen, {
      id,
      lat,
      lng,
      source: `${agent} · ${sig.source}`,
      title: sig.label,
      value: sig.value,
      confidence: sig.value,
      severity: sev,
      agent,
      domainKey,
      signalTimestamp: sig.timestamp,
      provenance: prov,
      narrativeWhy:
        sig.source === 'Federal Register'
          ? 'Regulatory volume shapes civic risk surface — JADE / THEMIS attestation path applies.'
          : sig.source.includes('data.gov')
            ? 'Institutional data freshness signals transparency health.'
            : `Information or systems signal for ${domainKey} — HERMES / DAEDALUS verification lanes.`,
      meta: {
        ...flattenRaw(sig.raw),
        freshnessSec: Math.max(0, Math.floor((Date.now() - new Date(sig.timestamp).getTime()) / 1000)),
      },
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

    const echoTs = parseEpiconTimestamp(item.timestamp);

    pushPin(pins, seen, {
      id,
      lat,
      lng,
      source: `${agent} · ${src}`,
      title,
      value,
      confidence: Math.min(1, 0.4 + Math.abs(change) / 15),
      severity: echoSev,
      agent,
      domainKey: sourceDomain(src),
      signalTimestamp: echoTs,
      provenance: 'CoinGecko · ECHO ingest · EPICON pipeline',
      narrativeWhy: 'Market pulse on financial lane — ECHO routes to HERMES narrative coupling.',
      meta: {
        ...flattenRaw(meta),
        epiconId: item.id,
        ledger: 'ECHO EPICON row (see Events chamber)',
        freshnessSec: Math.max(0, Math.floor((Date.now() - new Date(echoTs).getTime()) / 1000)),
      },
    });
  }

  // Second pass: EPICON items that carry lat/lng in echoIngest.metadata (e.g. USGS earthquakes
  // ingested via ECHO). These render as cyan pins — distinct from EONET orange/red layer.
  for (const item of echoEpicon ?? []) {
    const ingest = item.echoIngest;
    if (!ingest) continue;
    const src = ingest.source;
    if (src === 'CoinGecko') continue; // already handled above

    const meta = ingest.metadata ?? {};
    const lat2 = typeof meta.lat === 'number' ? meta.lat : null;
    const lng2 = typeof meta.lng === 'number' ? meta.lng : null;
    if (lat2 === null || lng2 === null) continue;

    const agent = item.ownerAgent ?? 'ECHO';
    const tier = item.confidenceTier ?? 0;
    const pinSev: GlobePinSeverity = tier >= 3 ? 'critical' : tier >= 2 ? 'elevated' : 'nominal';
    const val = Math.min(1, 0.5 + tier * 0.1);
    const echoTs2 = parseEpiconTimestamp(item.timestamp);
    const magnitude = typeof meta.magnitude === 'number' ? meta.magnitude : null;

    pushPin(pins, seen, {
      id: `epicon-${item.id}`,
      lat: lat2,
      lng: lng2,
      source: `${agent} · EPICON`,
      title: item.title ?? item.summary ?? item.id,
      value: val,
      confidence: val,
      severity: pinSev,
      agent,
      domainKey: 'environ',
      signalTimestamp: echoTs2,
      clusterKey: 'epicon_verified',
      clusterLabel: `EPICON · C-279`,
      provenance: `EPICON · ${item.id} · ECHO ingest`,
      narrativeWhy: `EPICON-verified event in ${item.category ?? 'unknown'} domain — cross-check with ledger attestation.`,
      layer: 'epicon',
      meta: {
        epiconId: item.id,
        confidenceTier: tier,
        mag: magnitude,
        source: src,
        freshnessSec: Math.max(0, Math.floor((Date.now() - new Date(echoTs2).getTime()) / 1000)),
      },
    });
  }

  return pins;
}

function parseEpiconTimestamp(ts: string): string {
  const m = ts.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC$/);
  if (m) return `${m[1]}T${m[2]}:00.000Z`;
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
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
