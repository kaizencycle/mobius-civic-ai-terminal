// C-356 — Derive GI snapshot from CPC substrate when KV is suspended.

const CPC_BASE = (process.env.CIVIC_LEDGER_URL ?? 'https://civic-protocol-core-ledger.onrender.com').replace(/\/$/, '');

export type GiSnapshot = {
  global_integrity: number;
  timestamp: string;
  source: 'cpc-derive';
};

export async function deriveGiFromSubstrate(): Promise<GiSnapshot | null> {
  try {
    const res = await fetch(`${CPC_BASE}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tools/call', params: { name: 'get_integrity_snapshot', arguments: {} } }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as unknown;
    const content = (data as Record<string, unknown>)?.result;
    if (!content || typeof content !== 'object') return null;
    const gi = (content as Record<string, unknown>).global_integrity;
    const ts = (content as Record<string, unknown>).timestamp;
    if (typeof gi !== 'number' || !Number.isFinite(gi)) return null;
    return {
      global_integrity: gi,
      timestamp: typeof ts === 'string' ? ts : new Date().toISOString(),
      source: 'cpc-derive',
    };
  } catch {
    return null;
  }
}
