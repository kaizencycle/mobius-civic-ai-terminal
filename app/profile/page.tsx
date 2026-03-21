'use client';

import MobiusIdentityCard from '@/components/identity/MobiusIdentityCard';
import { useMobiusIdentity } from '@/hooks/useMobiusIdentity';

export default function ProfilePage() {
  const { identity, loading, permissions } = useMobiusIdentity();

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
            {!loading && permissions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {permissions.map((permission) => (
                  <span
                    key={permission}
                    className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-slate-300"
                  >
                    {permission}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {identity ? (
          <MobiusIdentityCard identity={identity} />
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-slate-400">
            {loading ? 'Loading identity...' : 'Identity unavailable.'}
          </div>
        )}
      </div>
    </main>
  );
}
