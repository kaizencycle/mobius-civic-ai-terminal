'use client';

import { useEffect, useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

type Identity = { user?: { username?: string; mic_balance?: number; tier?: string } };

export default function MicPageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    fetch('/api/identity/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setIdentity(data as Identity))
      .catch(() => setIdentity({}));
  }, []);

  if (loading && !snapshot) return <ChamberSkeleton blocks={5} />;

  const integrity = (snapshot?.integrity?.data ?? {}) as { totalMicMinted?: number; mic_supply?: number };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="mb-3 text-lg font-semibold">MIC wallet</h1>
      {identity?.user ? (
        <div className="mb-3 rounded border border-slate-800 bg-slate-900/60 p-3 text-sm">
          {identity.user.username} · balance {identity.user.mic_balance ?? 0} · tier {identity.user.tier ?? 'Observer'}
        </div>
      ) : (
        <div className="mb-3 text-sm text-slate-400">Login required to view operator wallet details.</div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3 text-sm">totalMicMinted: {integrity.totalMicMinted ?? '—'}</div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3 text-sm">mic_supply: {integrity.mic_supply ?? '—'}</div>
      </div>
    </div>
  );
}
