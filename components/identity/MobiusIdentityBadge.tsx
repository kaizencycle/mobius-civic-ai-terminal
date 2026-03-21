'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { MobiusIdentity } from '@/lib/identity/types';

export default function MobiusIdentityBadge() {
  const [identity, setIdentity] = useState<MobiusIdentity | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch('/api/identity/me?username=kaizencycle', {
          cache: 'no-store',
        });
        const json = await res.json();
        if (mounted) {
          setIdentity(json.identity || null);
        }
      } catch {
        if (mounted) {
          setIdentity(null);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  if (!identity) {
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
      @{identity.username} · {identity.role} · MII {identity.mii_score.toFixed(2)}
    </Link>
  );
}
