'use client';

import { useEffect, useState } from 'react';

type TruthState = 'ledger_accepted' | 'hot_sealed' | 'ledger_rejected' | 'pending' | 'none';

type TruthLayerResponse = {
  state: TruthState;
  latest: {
    seal_id?: string | null;
    immortalized?: boolean | null;
  } | null;
  counts: {
    hot_sealed: number;
    ledger_accepted: number;
    ledger_rejected: number;
    retry_queue: number;
  };
};

const STATE_COLOR: Record<TruthState, string> = {
  ledger_accepted: 'text-emerald-300',
  hot_sealed: 'text-amber-300',
  ledger_rejected: 'text-rose-300',
  pending: 'text-slate-400',
  none: 'text-slate-500',
};

export default function TruthLayerPage() {
  const [data, setData] = useState<TruthLayerResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/canon/seal-verification', { cache: 'no-store' })
      .then((r) => r.json())
      .then((payload: TruthLayerResponse) => setData(payload))
      .catch(() => setErr('failed_to_load'));
  }, []);

  if (err) return <div className="p-4 text-rose-300">Truth Layer failed</div>;
  if (!data) return <div className="p-4 text-slate-400">Loading Truth Layer…</div>;

  const stateColor = STATE_COLOR[data.state] ?? 'text-slate-400';

  return (
    <div className="p-4 font-mono text-xs text-slate-200">
      <h1 className="text-lg text-cyan-300 mb-4">Truth Layer</h1>

      <div className="mb-4">
        <div>state: <span className={stateColor}>{data.state}</span></div>
        <div>latest_seal: {data.latest?.seal_id || '—'}</div>
        <div>immortalized: {String(Boolean(data.latest?.immortalized))}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>hot_sealed: {data.counts.hot_sealed}</div>
        <div>ledger_accepted: {data.counts.ledger_accepted}</div>
        <div>ledger_rejected: {data.counts.ledger_rejected}</div>
        <div>retry_queue: {data.counts.retry_queue}</div>
      </div>

      <div className="text-[10px] text-slate-500">
        HOT = KV truth<br />
        IMMORTALIZED = ledger accepted<br />
        REJECTED = needs fix<br />
      </div>
    </div>
  );
}
