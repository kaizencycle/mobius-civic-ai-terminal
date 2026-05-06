'use client';

import { useEffect, useMemo, useState } from 'react';

type CompareStatus = 'match' | 'mismatch' | 'missing' | 'unknown';

type CompareField = {
  field: string;
  status: CompareStatus;
  legacy: unknown;
  dal: unknown;
};

type DalProvenanceView = {
  source: string;
  freshness: string;
  timestamp: string | null;
  note?: string;
};

type ProvenanceRow = [string, DalProvenanceView];

type SnapshotCompareResponse = {
  ok: boolean;
  mode: string;
  migration_state: string;
  summary: {
    fields_checked: number;
    matches: number;
    mismatches: number;
    missing: number;
    unknown: number;
    parity_ratio: number;
    confidence_score: number;
    degraded_sources: string[];
    fallback_count: number;
    stale_count: number;
    cutover_recommendation: string;
    safe_to_cutover: boolean;
  };
  history: {
    frame: {
      id: string;
      ts: string;
      confidence_score: number;
      parity_ratio: number;
      mismatches: number;
      missing: number;
      unknown: number;
      fallback_count: number;
      stale_count: number;
      cutover_recommendation: string;
    };
    persistence: string;
    note: string;
  };
  comparisons: CompareField[];
  dal: {
    provenance?: DalProvenanceView;
    integrity?: {
      provenance?: DalProvenanceView;
    };
    tripwire?: {
      provenance?: DalProvenanceView;
    };
  };
  meta: {
    elapsed_ms: number;
    canonical_warning: string;
  };
};

type CompareError = { error?: string };

const STATUS_CLASS: Record<CompareStatus, string> = {
  match: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300',
  mismatch: 'border-rose-500/30 bg-rose-950/20 text-rose-300',
  missing: 'border-amber-500/30 bg-amber-950/20 text-amber-300',
  unknown: 'border-slate-600/40 bg-slate-900/70 text-slate-300',
};

function isSnapshotCompareResponse(payload: SnapshotCompareResponse | CompareError): payload is SnapshotCompareResponse {
  return (
    typeof (payload as SnapshotCompareResponse).mode === 'string' &&
    Boolean((payload as SnapshotCompareResponse).summary) &&
    Array.isArray((payload as SnapshotCompareResponse).comparisons)
  );
}

function displayValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function toProvenanceRows(data: SnapshotCompareResponse | null): ProvenanceRow[] {
  if (!data) return [];
  const rows: ProvenanceRow[] = [];
  if (data.dal.provenance) rows.push(['snapshot', data.dal.provenance]);
  if (data.dal.integrity?.provenance) rows.push(['integrity', data.dal.integrity.provenance]);
  if (data.dal.tripwire?.provenance) rows.push(['tripwire', data.dal.tripwire.provenance]);
  return rows;
}

export default function ComparePage() {
  const [data, setData] = useState<SnapshotCompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadCompare() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/terminal/snapshot-compare', { cache: 'no-store' });
      const payload = (await response.json()) as SnapshotCompareResponse | CompareError;
      if (!response.ok || !isSnapshotCompareResponse(payload)) {
        throw new Error('error' in payload ? payload.error ?? 'snapshot_compare_failed' : 'snapshot_compare_failed');
      }
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'snapshot_compare_failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCompare();
  }, []);

  const confidenceLabel = useMemo(() => {
    if (!data) return 'not_loaded';
    return `${Math.round(data.summary.confidence_score * 100)}% confidence`;
  }, [data]);

  const provenanceRows = useMemo(() => toProvenanceRows(data), [data]);

  return (
    <div className="h-full overflow-y-auto p-4 font-mono text-xs text-slate-200">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Mobius Migration</div>
          <h1 className="mt-1 text-lg font-semibold uppercase tracking-[0.16em] text-cyan-200">DAL Compare Chamber</h1>
          <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-slate-500">
            Diagnostic visibility for legacy snapshot vs DAL shadow state. Legacy snapshot remains authoritative; this chamber only measures readiness.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadCompare()}
          disabled={loading}
          className="rounded border border-cyan-500/40 px-3 py-1 text-cyan-200 hover:border-cyan-300 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh Compare'}
        </button>
      </div>

      {error ? <div className="mb-4 rounded border border-rose-500/30 bg-rose-950/20 p-3 text-rose-200">{error}</div> : null}
      {!data && !error ? <div className="rounded border border-slate-800 bg-slate-950/80 p-4 text-slate-400">Loading compare state…</div> : null}

      {data ? (
        <>
          <section className="mb-4 grid gap-3 md:grid-cols-4">
            <div className="rounded border border-cyan-500/25 bg-slate-950/80 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/80">Confidence</div>
              <div className="mt-2 text-2xl text-cyan-100">{confidenceLabel}</div>
              <div className="mt-1 text-slate-500">parity {data.summary.parity_ratio.toFixed(4)}</div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950/80 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Recommendation</div>
              <div className="mt-2 text-amber-200">{data.summary.cutover_recommendation}</div>
              <div className="mt-1 text-slate-500">safe: {String(data.summary.safe_to_cutover)}</div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950/80 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Drift</div>
              <div className="mt-2 text-slate-100">{data.summary.mismatches} mismatch</div>
              <div className="mt-1 text-slate-500">{data.summary.missing} missing · {data.summary.unknown} unknown</div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950/80 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Sources</div>
              <div className="mt-2 text-slate-100">{data.summary.fallback_count} fallback</div>
              <div className="mt-1 text-slate-500">{data.summary.stale_count} stale</div>
            </div>
          </section>

          <section className="mb-4 rounded border border-slate-800 bg-slate-950/80 p-4">
            <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-violet-300/80">Drift Table</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-[11px]">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-800">
                    <th className="py-2 pr-3">field</th>
                    <th className="py-2 pr-3">status</th>
                    <th className="py-2 pr-3">legacy</th>
                    <th className="py-2 pr-3">dal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.comparisons.map((item) => (
                    <tr key={item.field} className="border-b border-slate-900/80">
                      <td className="py-2 pr-3 text-slate-200">{item.field}</td>
                      <td className="py-2 pr-3">
                        <span className={`rounded border px-2 py-0.5 ${STATUS_CLASS[item.status]}`}>{item.status}</span>
                      </td>
                      <td className="max-w-[260px] truncate py-2 pr-3 text-slate-400">{displayValue(item.legacy)}</td>
                      <td className="max-w-[260px] truncate py-2 pr-3 text-slate-400">{displayValue(item.dal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-4 grid gap-3 md:grid-cols-2">
            <div className="rounded border border-slate-800 bg-slate-950/80 p-4">
              <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-emerald-300/80">DAL Provenance</div>
              <div className="space-y-2">
                {provenanceRows.map(([name, provenance]) => (
                  <div key={name} className="rounded border border-slate-800 bg-black/20 p-3">
                    <div className="text-slate-300">{name}</div>
                    <div className="mt-1 text-slate-500">source: {provenance.source} · freshness: {provenance.freshness}</div>
                    <div className="mt-1 text-slate-600">{provenance.note ?? 'no note'}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded border border-slate-800 bg-slate-950/80 p-4">
              <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-amber-300/80">History Frame</div>
              <div className="space-y-1 text-slate-400">
                <div>id: {data.history.frame.id}</div>
                <div>ts: {data.history.frame.ts}</div>
                <div>persistence: {data.history.persistence}</div>
                <div>elapsed: {data.meta.elapsed_ms}ms</div>
                <div className="pt-2 text-slate-500">{data.history.note}</div>
              </div>
            </div>
          </section>

          <section className="rounded border border-slate-800 bg-slate-950/70 p-4 text-[11px] text-slate-400">
            <div className="mb-2 uppercase tracking-[0.18em] text-cyan-300/80">Operator Law</div>
            <div>{data.meta.canonical_warning}</div>
            <div className="mt-2 text-amber-300">Current mode: diagnostic-only. No cutover authority is granted by this chamber.</div>
          </section>
        </>
      ) : null}
    </div>
  );
}
