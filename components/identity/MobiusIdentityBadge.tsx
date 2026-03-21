'use client';

import Link from 'next/link';
import { useMobiusIdentity } from '@/hooks/useMobiusIdentity';

function formatRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function MobiusIdentityBadge() {
  const { identity, loading } = useMobiusIdentity();

  if (loading || !identity) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.15em] text-slate-400">
        Identity loading…
      </div>
    );
  }

  return (
    <Link
      href="/profile"
      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.15em] text-slate-300 transition hover:border-sky-500/30 hover:bg-slate-800 hover:text-sky-200"
    >
      @{identity.username} · {formatRole(identity.role)} · MII {identity.mii_score.toFixed(2)} · MIC {identity.mic_balance}
    </Link>
  );
}
