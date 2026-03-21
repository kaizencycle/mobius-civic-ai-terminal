'use client';

import { useEffect, useState } from 'react';
import MobiusIdentityCard from '@/components/identity/MobiusIdentityCard';
import type { MobiusIdentity } from '@/lib/identity/types';

export default function ProfilePage() {
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

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <div>
            <div className="text-sm uppercase tracking-[0.3em] text-sky-300">
              Mobius Identity Layer
            </div>
            <h1 className="mt-3 text-3xl font-semibold">Profile &amp; Role Surface</h1>
            <p className="mt-1 text-sm text-slate-400">
              Identity, permissions, integrity score, and contribution state for the current Mobius node.
            </p>
          </div>
        </div>

        {identity ? (
          <MobiusIdentityCard identity={identity} />
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-slate-400">
            Loading identity...
          </div>
        )}
      </div>
    </main>
  );
}
