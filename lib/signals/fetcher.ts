// C-306 FIX-511-02: Fallback-aware fetch for signal instruments.
// Primary → fallback → error with score=0. Concurrency-capped batching.

import type { SignalInstrument } from './registry';

export interface InstrumentResult {
  id: string;
  agent: string;
  label: string;
  score: number;       // 0-1
  source: 'primary' | 'fallback' | 'error';
  latencyMs: number;
  error?: string;
}

async function tryUrl(
  inst: SignalInstrument,
  url: string,
  label: 'primary' | 'fallback',
  timeout: number,
  start: number,
): Promise<InstrumentResult | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mobius-ATLAS/1.0',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const ct = (res.headers.get('content-type') ?? '').toLowerCase();
    const text = await res.text();
    let data: unknown = text;
    if (!ct.includes('xml') && !text.trimStart().startsWith('<')) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = text;
      }
    }

    const raw = inst.normalize(data);
    const score = parseFloat(Math.min(Math.max(raw, 0), 1).toFixed(3));
    return { id: inst.id, agent: inst.agent, label: inst.label, score, source: label, latencyMs: Date.now() - start };
  } catch {
    return null;
  }
}

export async function fetchInstrument(inst: SignalInstrument): Promise<InstrumentResult> {
  const timeout = inst.timeoutMs ?? 4000;
  const start = Date.now();

  const primary = await tryUrl(inst, inst.primary, 'primary', timeout, start);
  if (primary) return primary;

  if (inst.fallback) {
    const fallback = await tryUrl(inst, inst.fallback, 'fallback', timeout, start);
    if (fallback) return fallback;
  } else {
    // C-343: 34 of 40 instruments are single-source, so a single transient blip
    // (cold start, momentary timeout, brief 5xx) scores a hard 0 and drags the agent
    // composite with no recovery path. Give single-source instruments exactly one
    // bounded retry on the primary before declaring failure. Instruments that already
    // have a fallback chain are left unchanged (the fallback is their resilience path).
    const retry = await tryUrl(inst, inst.primary, 'primary', timeout, start);
    if (retry) return retry;
  }

  return {
    id: inst.id,
    agent: inst.agent,
    label: inst.label,
    score: 0,
    source: 'error',
    latencyMs: Date.now() - start,
    error: inst.fallback ? 'primary and fallback both failed' : 'primary failed (with retry)',
  };
}

export async function fetchAllInstruments(
  registry: SignalInstrument[],
  concurrency = 8,
): Promise<InstrumentResult[]> {
  const results: InstrumentResult[] = [];
  for (let i = 0; i < registry.length; i += concurrency) {
    const batch = registry.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fetchInstrument));
    results.push(...batchResults);
  }
  return results;
}
