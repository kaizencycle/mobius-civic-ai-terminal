'use client';

import { useEffect, useState } from 'react';
import { AttestationProofPanel } from '@/components/mic/AttestationProofPanel';
import { GenesisBlockViewer } from '@/components/mic/GenesisBlockViewer';
import { MicStatusCard } from '@/components/mic/MicStatusCard';
import { SealProofPanel } from '@/components/mic/SealProofPanel';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { fetchMicAttestations } from '@/lib/mic/fetchMicAttestations';
import { fetchMicGenesisBlock } from '@/lib/mic/fetchMicGenesisBlock';
import { fetchMicReadiness } from '@/lib/mic/fetchMicReadiness';
import { fetchMicSeal } from '@/lib/mic/fetchMicSeal';
import type { MicGenesisBlockSummary, MicReadinessResponse, MicRewardAttestationSummary, MicSealSnapshot } from '@/lib/mic/types';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

type Identity = { user?: { username?: string; mic_balance?: number; tier?: string } };

export default function MicPageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [readiness, setReadiness] = useState<MicReadinessResponse | null>(null);
  const [attestations, setAttestations] = useState<MicRewardAttestationSummary[]>([]);
  const [seal, setSeal] = useState<MicSealSnapshot | null>(null);
  const [genesis, setGenesis] = useState<MicGenesisBlockSummary | null>(null);
  const [readinessErr, setReadinessErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/identity/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setIdentity(data as Identity))
      .catch(() => setIdentity({}));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [r, a, s, g] = await Promise.all([
          fetchMicReadiness(),
          fetchMicAttestations(),
          fetchMicSeal(),
          fetchMicGenesisBlock(),
        ]);
        if (!r) {
          setReadinessErr('MIC readiness unavailable');
          setReadiness(null);
        } else {
          setReadinessErr(null);
          setReadiness(r);
        }
        setAttestations(a);
        setSeal(s);
        setGenesis(g);
      } catch {
        setReadinessErr('MIC readiness fetch failed');
        setReadiness(null);
      }
    })();
  }, []);

  if (loading && !snapshot) return <ChamberSkeleton blocks={5} />;

  const integrity = (snapshot?.integrity?.data ?? {}) as {
    totalMicProvisional?: number;
    totalMicMinted?: number;
    mic_supply?: number;
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="mb-3 text-lg font-semibold text-slate-100">MIC · operator surface</h1>

      {readinessErr || !readiness ? (
        <div className="mb-4 rounded border border-amber-500/35 bg-amber-950/25 px-3 py-2 font-mono text-xs text-amber-100">
          {readinessErr ?? 'Loading MIC readiness…'}
        </div>
      ) : (
        <div className="mb-4 space-y-4">
          <MicStatusCard readiness={readiness} attestations={attestations} />
          {seal ? <SealProofPanel seal={seal} /> : null}
          {genesis ? <GenesisBlockViewer block={genesis} /> : null}
          {attestations.length > 0 ? <AttestationProofPanel attestation={attestations[0]} /> : null}
        </div>
      )}

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Wallet / snapshot</h2>
      {identity?.user ? (
        <div className="mb-3 rounded border border-slate-800 bg-slate-900/60 p-3 text-sm">
          {identity.user.username} · balance {identity.user.mic_balance ?? 0} · tier {identity.user.tier ?? 'Observer'}
        </div>
      ) : (
        <div className="mb-3 text-sm text-slate-400">Login required to view operator wallet details.</div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3 text-sm">
          totalMicProvisional: {integrity.totalMicProvisional ?? integrity.totalMicMinted ?? '—'}
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3 text-sm">mic_supply: {integrity.mic_supply ?? '—'}</div>
      </div>
    </div>
  );
}
