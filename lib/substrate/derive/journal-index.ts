// C-356 — Derive journal index from CPC EPICON feed when KV is suspended.

const CPC_BASE = (process.env.CIVIC_LEDGER_URL ?? 'https://civic-protocol-core-ledger.onrender.com').replace(/\/$/, '');

export type JournalIndexEntry = {
  id: string;
  agent: string;
  cycle: string;
  timestamp: string;
  summary?: string;
};

export async function deriveJournalIndexFromEpicon(): Promise<JournalIndexEntry[]> {
  try {
    const res = await fetch(`${CPC_BASE}/epicon/feed?limit=100`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as unknown;
    const entries = Array.isArray(data) ? data : ((data as Record<string, unknown>)?.entries ?? []);
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
      .map((e) => ({
        id: String(e.id ?? ''),
        agent: String(e.agent ?? '').toUpperCase(),
        cycle: String(e.cycle ?? ''),
        timestamp: String(e.timestamp ?? new Date().toISOString()),
        summary: typeof e.summary === 'string' ? e.summary : undefined,
      }))
      .filter((e) => e.id && e.agent && e.cycle);
  } catch {
    return [];
  }
}
