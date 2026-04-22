import type { MicroSignal } from '@/lib/agents/micro/core';
import type { EpiconItem } from '@/lib/terminal/types';
import type { SentimentDomainKey } from '@/lib/terminal/globePins';
import { GLOBE_DOMAIN_ORDER } from '@/lib/terminal/globePins';

export type GlobeDashboardBundle = {
  eveStrip: string | null;
  snapshotLoaded?: boolean;
  signalWarnings?: Array<{ type: 'instrument_dropout'; count: number; message: string }>;
  panelAgeSeconds?: Record<string, number | null>;
  echoEpicon?: EpiconItem[];
  kvHealth: unknown;
  runtime: unknown;
  tripwire: unknown;
  vault: unknown;
  micReadiness: unknown;
  miiFeed: unknown;
};

export type SeismicRow = { mag: number; place: string; timeMs: number };

export type MiiAgentScore = { agent: string; mii: number; timestamp: string };

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object') return null;
  return v as Record<string, unknown>;
}

export function pickLatestMiiByAgent(miiLeafData: unknown): Record<string, MiiAgentScore> {
  const row = asRecord(miiLeafData);
  const entries = row?.entries;
  if (!Array.isArray(entries)) return {};
  const out: Record<string, MiiAgentScore> = {};
  for (const e of entries) {
    const o = asRecord(e);
    if (!o) continue;
    const agent = typeof o.agent === 'string' ? o.agent.toUpperCase().trim() : '';
    const mii = typeof o.mii === 'number' && Number.isFinite(o.mii) ? o.mii : null;
    const ts = typeof o.timestamp === 'string' ? o.timestamp : '';
    if (!agent || mii === null) continue;
    const prev = out[agent];
    if (!prev || ts > prev.timestamp) {
      out[agent] = { agent, mii, timestamp: ts };
    }
  }
  return out;
}

export function extractUsgsSamples(echoEpicon: EpiconItem[] | null): SeismicRow[] {
  const rows: SeismicRow[] = [];
  for (const row of echoEpicon ?? []) {
    const ingest = row.echoIngest;
    if (!ingest || ingest.source !== 'USGS') continue;
    const meta = ingest.metadata ?? {};
    const mag = typeof meta.magnitude === 'number' && Number.isFinite(meta.magnitude) ? meta.magnitude : null;
    if (mag === null) continue;
    const place = row.title?.replace(/^M[\d.]+\s*[·-]\s*/i, '') ?? row.summary ?? 'unknown';
    const timeMs = new Date(row.timestamp).getTime();
    rows.push({ mag, place, timeMs: Number.isFinite(timeMs) ? timeMs : Date.now() });
  }
  rows.sort((a, b) => b.timeMs - a.timeMs);
  return rows.slice(0, 16);
}

export function freshnessLabel(ageSeconds: number | null): string {
  if (ageSeconds == null) return 'awaiting data';
  if (ageSeconds < 60) return 'just now';
  if (ageSeconds < 300) return `${Math.floor(ageSeconds / 60)}m ago`;
  if (ageSeconds < 1800) return `${Math.floor(ageSeconds / 60)}m ago · stale`;
  return `${Math.floor(ageSeconds / 3600)}h ago · very stale`;
}

function sourceLower(s: MicroSignal): string {
  return `${s.source} ${s.label}`.toLowerCase();
}

export function partitionMicroSignals(micro: { allSignals?: MicroSignal[] } | null): {
  environmental: MicroSignal[];
  markets: MicroSignal[];
  governance: MicroSignal[];
} {
  const all = micro?.allSignals ?? [];
  const environmental: MicroSignal[] = [];
  const markets: MicroSignal[] = [];
  const governance: MicroSignal[] = [];
  for (const s of all) {
    const sl = sourceLower(s);
    const agent = (s.agentName ?? '').toUpperCase();
    if (sl.includes('usgs') || sl.includes('earthquake')) continue;
    if (
      agent === 'GAIA' ||
      sl.includes('eonet') ||
      sl.includes('nasa') ||
      sl.includes('open-meteo') ||
      sl.includes('meteo') ||
      sl.includes('nws') ||
      sl.includes('relief') ||
      sl.includes('iss') ||
      sl.includes('weather')
    ) {
      environmental.push(s);
      continue;
    }
    if (
      sl.includes('coingecko') ||
      sl.includes('bitcoin') ||
      sl.includes('ethereum') ||
      sl.includes('solana') ||
      sl.includes('frankfurter') ||
      sl.includes('eur/usd') ||
      sl.includes('fx')
    ) {
      markets.push(s);
      continue;
    }
    if (
      sl.includes('federal register') ||
      sl.includes('usaspending') ||
      sl.includes('openfda') ||
      sl.includes('crossref') ||
      sl.includes('arxiv') ||
      sl.includes('data.gov')
    ) {
      governance.push(s);
      continue;
    }
  }
  return { environmental, markets, governance };
}

export function gdeltDeadLane(micro: { allSignals?: MicroSignal[] } | null): boolean {
  for (const s of micro?.allSignals ?? []) {
    const sl = sourceLower(s);
    if (!sl.includes('gdelt')) continue;
    if (sl.includes('dead-instrument') || sl.includes('dead lane') || sl.includes('neutral baseline')) return true;
    const raw = s.raw && typeof s.raw === 'object' ? (s.raw as Record<string, unknown>) : null;
    if (raw?.structuralEmpty === true) return true;
  }
  return false;
}

export function buildEveEscalationStrip(epicon: EpiconItem[]): string | null {
  const scored = epicon
    .filter((row) => {
      const t = (row.title ?? '').toLowerCase();
      const o = (row.ownerAgent ?? '').toUpperCase();
      const origin = (row.agentOrigin ?? '').toUpperCase();
      return o === 'EVE' || origin === 'EVE' || t.includes('eve review') || t.includes('eve escalation');
    })
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const top = scored[0];
  if (!top) return null;
  const parts: string[] = [];
  const title = top.title?.trim() ?? '';
  if (title) parts.push(title.slice(0, 120));
  const trace = Array.isArray(top.trace) ? top.trace : [];
  const tagHints = [...trace].filter((x) => typeof x === 'string' && /gi_critical|ethics:|civic-risk|escalation/i.test(x)).slice(0, 4);
  parts.push(...tagHints);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function domainBarColor(key: SentimentDomainKey, score: number | null): string {
  if (score == null) return '#64748b';
  if (score >= 0.8) return '#34d399';
  if (score >= 0.65) return '#38bdf8';
  if (score >= 0.55) return '#fbbf24';
  return '#fb7185';
}

export { GLOBE_DOMAIN_ORDER };
