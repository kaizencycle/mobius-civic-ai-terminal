'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MobiusIdentityCard from '@/components/identity/MobiusIdentityCard';
import type { MobiusIdentity } from '@/lib/identity/types';
import type { MobiusProfile, MIIHistoryPoint, StoredEpicon } from '@/lib/mobius/stores';

type ProfileResponse = {
  ok: boolean;
  profile: MobiusProfile;
  epicons: StoredEpicon[];
};

function tierColor(tier: string): string {
  switch (tier) {
    case 'signal-node': return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
    case 'node-2': return 'text-violet-300 border-violet-500/30 bg-violet-500/10';
    case 'node-1': return 'text-sky-300 border-sky-500/30 bg-sky-500/10';
    case 'participant': return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
    default: return 'text-slate-300 border-slate-700 bg-slate-900';
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'verified': return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
    case 'contradicted': return 'text-red-300 border-red-500/30 bg-red-500/10';
    default: return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
  }
}

function outcomeColor(outcome?: string | null): string {
  switch (outcome) {
    case 'hit': return 'text-emerald-300';
    case 'miss': return 'text-red-300';
    default: return 'text-slate-500';
  }
}

function miiBarColor(score: number): string {
  if (score >= 0.80) return 'bg-emerald-500';
  if (score >= 0.65) return 'bg-sky-500';
  if (score >= 0.50) return 'bg-amber-500';
  return 'bg-red-500';
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-mono font-semibold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function MIISparkline({ history }: { history: MIIHistoryPoint[] }) {
  if (history.length === 0) return null;
  const maxScore = Math.max(...history.map((h) => h.score), 0.6);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-3 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
        MII Trend
      </div>
      <div className="flex h-24 items-end gap-1.5">
        {history.map((point, i) => {
          const height = Math.max(8, (point.score / maxScore) * 80);
          return (
            <div key={`${point.timestamp}-${i}`} className="group relative flex-1">
              <div
                className={`rounded-t ${miiBarColor(point.score)} transition-all duration-300`}
                style={{ height: `${height}px` }}
              />
              <div className="absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 group-hover:block">
                <div className="whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[10px] font-mono text-slate-300 shadow-lg">
                  <div className="text-sky-300">{point.score.toFixed(2)}</div>
                  <div className="text-slate-500">{new Date(point.timestamp).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-mono text-slate-600">
        <span>{history.length > 0 ? new Date(history[0].timestamp).toLocaleDateString() : ''}</span>
        <span>{history.length > 1 ? new Date(history[history.length - 1].timestamp).toLocaleDateString() : ''}</span>
      </div>
    </div>
  );
}

function TierProgressBar({ currentTier, mii }: { currentTier: string; mii: number }) {
  const tiers = [
    { key: 'observer', label: 'Observer', threshold: 0 },
    { key: 'participant', label: 'Participant', threshold: 0.50 },
    { key: 'node-1', label: 'Node-1', threshold: 0.65 },
    { key: 'node-2', label: 'Node-2', threshold: 0.80 },
    { key: 'signal-node', label: 'Signal Node', threshold: 0.90 },
  ];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-3 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
        Tier Progression
      </div>
      <div className="space-y-2">
        {tiers.map((tier) => {
          const active = tier.key === currentTier;
          const reached = mii >= tier.threshold;
          return (
            <div key={tier.key} className="flex items-center gap-3">
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                active ? 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.4)]' :
                reached ? 'bg-emerald-500/60' : 'bg-slate-700'
              }`} />
              <div className={`flex-1 text-sm font-mono ${active ? 'font-medium text-sky-300' : reached ? 'text-slate-300' : 'text-slate-600'}`}>
                {tier.label}
              </div>
              <div className={`text-xs font-mono ${active ? 'text-sky-400' : 'text-slate-600'}`}>
                {tier.threshold > 0 ? `≥ ${tier.threshold.toFixed(2)}` : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryTimeline({ history }: { history: MIIHistoryPoint[] }) {
  const reversed = [...history].reverse();

  return (
    <div className="space-y-2">
      {reversed.map((point, i) => (
        <div key={`${point.timestamp}-${i}`} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className={`mt-0.5 shrink-0 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-mono ${miiBarColor(point.score).replace('bg-', 'text-').replace('500', '300')}`}>
            {point.score.toFixed(2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-200">{point.reason}</div>
            <div className="mt-1 text-[11px] font-mono text-slate-500">
              {new Date(point.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EpiconList({ epicons }: { epicons: StoredEpicon[] }) {
  if (epicons.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center text-sm text-slate-500">
        No EPICONs submitted yet. Use /submit in the terminal to create your first signal.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {epicons.map((e) => (
        <div key={e.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">{e.id}</div>
              <div className="mt-1 text-sm font-medium text-slate-200">{e.title}</div>
              <div className="mt-1 line-clamp-2 text-xs text-slate-400">{e.summary}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] ${statusColor(e.status)}`}>
                {e.status}
              </span>
              {e.verificationOutcome && (
                <span className={`text-[10px] font-mono uppercase ${outcomeColor(e.verificationOutcome)}`}>
                  {e.verificationOutcome}
                </span>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-slate-400">
              {e.category}
            </span>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-slate-400">
              T{e.confidenceTier}
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {new Date(e.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [identity, setIdentity] = useState<MobiusIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginInput, setLoginInput] = useState('kaizencycle');

  async function loadProfile(login: string) {
    setLoading(true);
    try {
      const [profileRes, identityRes] = await Promise.all([
        fetch(`/api/profile?login=${encodeURIComponent(login)}`, { cache: 'no-store' }),
        fetch(`/api/identity/me?username=${encodeURIComponent(login)}`, { cache: 'no-store' }),
      ]);
      const [profileJson, identityJson] = await Promise.all([profileRes.json(), identityRes.json()]);
      setData(profileJson);
      setIdentity(identityJson.identity || null);
    } catch {
      setData(null);
      setIdentity(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile('kaizencycle');
  }, []);

  const profile = data?.profile;
  const epicons = data?.epicons ?? [];
  const totalReviewed = (profile?.verificationHits ?? 0) + (profile?.verificationMisses ?? 0);
  const accuracy = totalReviewed > 0
    ? ((profile?.verificationHits ?? 0) / totalReviewed * 100).toFixed(0)
    : '—';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <Link href="/terminal" className="text-xs font-mono uppercase tracking-[0.25em] text-sky-300 transition hover:text-sky-200">
              &larr; Mobius Terminal
            </Link>
            <h1 className="mt-2 text-2xl font-semibold">Mobius Profile</h1>
            <p className="mt-1 text-sm text-slate-400">
              Identity, permissions, reputation, and contribution history for the active Mobius operator.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadProfile(loginInput)}
              placeholder="github login"
              className="w-40 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-white outline-none placeholder:text-slate-600 focus:border-sky-500/40"
            />
            <button
              onClick={() => loadProfile(loginInput)}
              className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-mono uppercase tracking-[0.14em] text-sky-300 transition hover:bg-sky-500/15"
            >
              Load
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-slate-400">
            Loading Mobius profile surfaces…
          </div>
        ) : !profile ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-200">
            Unable to load this profile right now.
          </div>
        ) : (
          <div className="space-y-6">
            {identity ? <MobiusIdentityCard identity={identity} /> : null}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <div className="space-y-6">
                <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500">Mobius Reputation</div>
                      <h2 className="mt-2 text-xl font-semibold text-white">{profile.displayName}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-mono uppercase tracking-[0.14em]">
                        <span className={`rounded-md border px-2 py-1 ${tierColor(profile.nodeTier)}`}>
                          {profile.nodeTier}
                        </span>
                        <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">
                          @{profile.login}
                        </span>
                        <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">
                          {identity?.status || 'active'}
                        </span>
                      </div>
                    </div>
                    <div className="min-w-[180px] rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">Current MII</div>
                      <div className="mt-2 text-3xl font-semibold text-white">{profile.miiScore.toFixed(2)}</div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div className={`h-full ${miiBarColor(profile.miiScore)}`} style={{ width: `${Math.min(profile.miiScore * 100, 100)}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Stat label="Signals Submitted" value={String(profile.epiconCount)} />
                    <Stat label="Verification Hits" value={String(profile.verificationHits)} />
                    <Stat label="Verification Misses" value={String(profile.verificationMisses)} />
                    <Stat label="Accuracy" value={accuracy === '—' ? accuracy : `${accuracy}%`} sub={`${totalReviewed} reviewed`} />
                  </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-2">
                  <MIISparkline history={profile.miiHistory} />
                  <TierProgressBar currentTier={profile.nodeTier} mii={profile.miiScore} />
                </section>

                <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                  <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500">Recent EPICONs</div>
                  <div className="mt-4">
                    <EpiconList epicons={epicons} />
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                  <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500">Integrity History</div>
                  <div className="mt-4">
                    <HistoryTimeline history={profile.miiHistory} />
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                  <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500">Identity Layer Notes</div>
                  <div className="mt-3 space-y-3 text-sm text-slate-400">
                    <p>
                      Mobius Identity now binds role visibility, MIC state, and EPICON contribution count into a single operator surface.
                    </p>
                    <p>
                      This scaffold keeps storage in memory so the terminal can evolve toward real auth, wallet linkage, and role-based permissions without changing the UI contract.
                    </p>
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
