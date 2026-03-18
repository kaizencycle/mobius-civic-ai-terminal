'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MobiusProfile, MIIHistoryPoint, StoredEpicon } from '@/lib/mobius/stores';

// ── Types for API response ───────────────────────────────────

type ProfileResponse = {
  ok: boolean;
  profile: MobiusProfile;
  epicons: StoredEpicon[];
};

// ── Helpers ──────────────────────────────────────────────────

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

// ── Components ───────────────────────────────────────────────

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
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500 mb-3">
        MII Trend
      </div>
      <div className="flex items-end gap-1.5 h-24">
        {history.map((point, i) => {
          const height = Math.max(8, (point.score / maxScore) * 80);
          return (
            <div
              key={`${point.timestamp}-${i}`}
              className="group relative flex-1"
            >
              <div
                className={`rounded-t ${miiBarColor(point.score)} transition-all duration-300`}
                style={{ height: `${height}px` }}
              />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[10px] font-mono text-slate-300 whitespace-nowrap shadow-lg">
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
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500 mb-3">
        Tier Progression
      </div>
      <div className="space-y-2">
        {tiers.map((tier) => {
          const active = tier.key === currentTier;
          const reached = mii >= tier.threshold;
          return (
            <div key={tier.key} className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                active ? 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.4)]' :
                reached ? 'bg-emerald-500/60' : 'bg-slate-700'
              }`} />
              <div className={`flex-1 text-sm font-mono ${active ? 'text-sky-300 font-medium' : reached ? 'text-slate-300' : 'text-slate-600'}`}>
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
          <div className={`mt-0.5 shrink-0 rounded-md border px-2 py-1 text-xs font-mono ${miiBarColor(point.score).replace('bg-', 'text-').replace('500', '300')} border-slate-700 bg-slate-900`}>
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
              <div className="mt-1 text-xs text-slate-400 line-clamp-2">{e.summary}</div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
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
          <div className="mt-2 flex items-center gap-2 flex-wrap">
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

// ── Main Page ────────────────────────────────────────────────

export default function ProfilePage() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginInput, setLoginInput] = useState('kaizencycle');

  async function loadProfile(login: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/profile?login=${encodeURIComponent(login)}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
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
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div>
            <Link href="/terminal" className="text-xs font-mono uppercase tracking-[0.25em] text-sky-300 hover:text-sky-200 transition">
              &larr; Mobius Terminal
            </Link>
            <h1 className="mt-2 text-2xl font-semibold">Mobius Profile</h1>
            <p className="mt-1 text-sm text-slate-400">
              Reputation is earned through contribution, verification, and consistency.
            </p>
          </div>
          {/* Login lookup */}
          <div className="flex items-center gap-2">
            <input
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadProfile(loginInput)}
              placeholder="github login"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-white outline-none placeholder:text-slate-600 focus:border-sky-500/40 w-40"
            />
            <button
              onClick={() => loadProfile(loginInput)}
              className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-mono text-sky-300 hover:bg-sky-500/20 transition"
            >
              Load
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        {loading ? (
          <div className="text-center text-slate-400 py-20">Loading profile...</div>
        ) : !profile ? (
          <div className="text-center text-slate-400 py-20">No profile found. Try a different login.</div>
        ) : (
          <div className="space-y-6">
            {/* Identity card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-2xl font-semibold text-white">{profile.displayName}</div>
                  <div className="mt-1 text-sm font-mono text-slate-400">@{profile.login}</div>
                  <div className="mt-1 text-xs font-mono text-slate-500">
                    Member since {new Date(profile.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-3xl font-mono font-bold text-white">{profile.miiScore.toFixed(2)}</div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">MII Score</div>
                  </div>
                  <span className={`rounded-lg border px-3 py-1.5 text-xs font-mono uppercase tracking-[0.12em] ${tierColor(profile.nodeTier)}`}>
                    {profile.nodeTier}
                  </span>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="EPICONs" value={String(profile.epiconCount)} />
                <Stat
                  label="Accuracy"
                  value={accuracy === '—' ? '—' : `${accuracy}%`}
                  sub={`${profile.verificationHits} hits / ${profile.verificationMisses} misses`}
                />
                <Stat label="Hits" value={String(profile.verificationHits)} />
                <Stat label="Misses" value={String(profile.verificationMisses)} />
              </div>
            </div>

            {/* Two-column layout */}
            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              {/* Left: MII trend + EPICON history */}
              <div className="space-y-6">
                <MIISparkline history={profile.miiHistory ?? []} />
                <div>
                  <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-400 mb-3">
                    EPICON Submissions ({epicons.length})
                  </div>
                  <EpiconList epicons={epicons} />
                </div>
              </div>

              {/* Right: Tier progression + MII history log */}
              <div className="space-y-6">
                <TierProgressBar currentTier={profile.nodeTier} mii={profile.miiScore} />
                <div>
                  <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-400 mb-3">
                    MII History ({(profile.miiHistory ?? []).length} events)
                  </div>
                  <HistoryTimeline history={profile.miiHistory ?? []} />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
