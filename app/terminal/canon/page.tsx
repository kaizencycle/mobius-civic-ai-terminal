'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type CanonResponse = any;

export default function CanonPage() {
  const [data, setData] = useState<CanonResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/substrate/canon?type=reserve_blocks', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setErr('Failed to load canon'));
  }, []);

  if (err) return <div className="p-4 text-rose-300 text-sm">{err}</div>;
  if (!data) return <div className="p-4 text-slate-400 text-sm">Loading canon…</div>;

  return (
    <div className="p-4 text-slate-200 font-mono text-xs">
      <div className="flex justify-between mb-3">
        <h1 className="text-violet-300 uppercase tracking-widest">Substrate Canon</h1>
        <Link href="/terminal/vault" className="text-slate-500 hover:text-cyan-300">← Vault</Link>
      </div>

      <div className="mb-4 text-[10px] text-slate-500">
        Read-only ledger of Reserve Blocks, attestations, and substrate proofs.
      </div>

      {data.reserve_blocks.map((b: any) => (
        <div key={b.seal_id} className="border border-slate-800 p-3 mb-3 rounded">
          <div className="text-cyan-300">Block {b.block_number}</div>
          <div className="text-slate-400">Seal: {b.seal_id}</div>
          <div>Status: {b.status} · {b.attestation_state}</div>
          <div>GI: {b.gi_at_seal} · Cycle: {b.cycle_at_seal}</div>
          <div>Hash: {b.seal_hash.slice(0, 12)}…</div>
          <div className="mt-2">
            <div className="text-slate-500">Attestations:</div>
            {b.attestations.map((a: any) => (
              <div key={a.agent} className="flex justify-between">
                <span>{a.agent}</span>
                <span>{a.signed ? a.verdict : 'missing'}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
