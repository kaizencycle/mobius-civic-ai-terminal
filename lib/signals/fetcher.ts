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

    const ct = res.headers.get('content-type') ?? '';
    const data = ct.includes('xml')
      ? await res.text()
      : await res.json().catch(() => res.text());

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
  }

  return {
    id: inst.id,
    agent: inst.agent,
    label: inst.label,
    score: 0,
    source: 'error',
    latencyMs: Date.now() - start,
    error: 'primary and fallback both failed',
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
