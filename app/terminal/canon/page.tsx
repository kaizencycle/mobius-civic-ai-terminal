'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CanonResponse } from '@/lib/substrate/canon';

export default function CanonPage() {
  const [data, setData] = useState<CanonResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/substrate/canon?type=reserve_blocks', { cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json()) as CanonResponse;
        if (!r.ok) throw new Error('canon_fetch_failed');
        setData(j);
      })
      .catch(() => setErr('Failed to load canon'));
  }, []);

  if (err) return <div className="p-4 text-sm text-rose-300">{err}</div>;
  if (!data) return <div className="p-4 text-sm text-slate-400">Loading canon…</div>;

  return (
    <div className="h-full overflow-y-auto p-4 font-mono text-xs text-slate-200">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Mobius Substrate</div>
          <h1 className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-violet-200">Canon Browser</h1>
          <p className="mt-1 text-[11px] text-slate-500">Read-only inspection layer for Reserve Blocks and attestations.</p>
        </div>
        <div className="flex gap-2 text-[10px]">
          <Link href="/terminal/vault" className="text-slate-400 hover:text-cyan-300">← Vault</Link>
        </div>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <div className="rounded border border-slate-800 bg-slate-950/80 p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Total Seals</div>
          <div className="mt-1 text-lg text-cyan-200">{data.counts.total_seals}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950/80 p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Attested</div>
          <div className="mt-1 text-lg text-emerald-300">{data.counts.attested}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950/80 p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Timeout</div>
          <div className="mt-1 text-lg text-rose-300">{data.counts.quarantined_timeout}</div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950/80 p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Needs Re-Attestation</div>
          <div className="mt-1 text-lg text-amber-300">{data.counts.needs_reattestation}</div>
        </div>
      </div>

      <div className="text-[11px] text-slate-400">
        {data.counts.total_seals} seals on record · {data.counts.attested} attested · {data.counts.quarantined_timeout} quarantined (timeout — re-attestation needed)
      </div>
    </div>
  );
}
