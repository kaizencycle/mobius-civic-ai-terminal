'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'mobius_onboarding_complete';

const CHAMBERS = [
  {
    icon: '◎',
    name: 'Globe',
    role: 'World State',
    detail: 'Real-time 3D/2D view of global integrity, agent signals, and EPICON events across civic domains.',
  },
  {
    icon: '∿',
    name: 'Pulse',
    role: 'Event Dashboard',
    detail: 'Live event screener showing ECHO feed, EPICON attestations, and system pulse across all lanes.',
  },
  {
    icon: '⊕',
    name: 'Signals',
    role: 'Micro-agent Intelligence',
    detail: 'Per-agent signal sweep across 10 sentinel families — ATLAS, ZEUS, HERMES, AUREA, and more.',
  },
  {
    icon: '◉',
    name: 'Sentinel',
    role: 'Agent Diagnostics',
    detail: 'Agent health, journal freshness, MII trends, and heartbeat status for the full sentinel fleet.',
  },
  {
    icon: '⛓',
    name: 'Ledger',
    role: 'Attested Facts',
    detail: 'Immutable ledger entries, EPICON records, and chain verification — the fact rail of Mobius.',
  },
  {
    icon: '✦',
    name: 'Journal',
    role: 'Agent Memory',
    detail: 'Structured reasoning memory — each agent\'s observations, verifications, and cycle reflections.',
  },
  {
    icon: '◇',
    name: 'Vault',
    role: 'MIC Economy',
    detail: 'Reserve balance, activation gates, GI thresholds, and integrity credit accounting.',
  },
] as const;

export default function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  }, []);

  if (!visible) return null;

  const isIntro = step === 0;
  const isChamberStep = step >= 1 && step <= CHAMBERS.length;
  const isOutro = step === CHAMBERS.length + 1;
  const chamber = isChamberStep ? CHAMBERS[step - 1] : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-lg border border-slate-700/80 bg-slate-900 shadow-2xl shadow-cyan-500/5">
        <div className="p-5 md:p-6">
          {isIntro ? (
            <>
              <div className="mb-1 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400/80">
                Mobius Civic Terminal
              </div>
              <h2 className="text-center text-lg font-semibold text-slate-100">
                Welcome, Operator
              </h2>
              <p className="mt-3 text-center text-xs leading-relaxed text-slate-400">
                The Terminal is the operator read/interact surface for
                {' '}
                <a
                  href="https://github.com/kaizencycle/Mobius-Substrate"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 underline decoration-cyan-500/30"
                >
                  Mobius Substrate
                </a>
                . It displays live integrity data, agent status, ledger events, and signal intelligence — all derived from real system state.
              </p>
              <p className="mt-2 text-center text-xs leading-relaxed text-slate-500">
                This is not a dashboard of invented numbers. Every value here is sourced from the substrate or explicitly marked as degraded/unavailable.
              </p>
            </>
          ) : isOutro ? (
            <>
              <div className="mb-1 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400/80">
                Ready
              </div>
              <h2 className="text-center text-lg font-semibold text-slate-100">
                You&apos;re set
              </h2>
              <p className="mt-3 text-center text-xs leading-relaxed text-slate-400">
                Use the chamber tabs at the top to navigate. Type{' '}
                <code className="rounded bg-slate-800 px-1 py-0.5 text-[10px] text-cyan-300">/help</code>{' '}
                in the command console for available commands. Alt+1 through Alt+7 for quick chamber access.
              </p>
              <p className="mt-2 text-center text-xs leading-relaxed text-slate-500">
                The{' '}
                <a
                  href="https://mobius-browser-shell.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 underline decoration-violet-500/30"
                >
                  Browser Shell
                </a>
                {' '}is the citizen entry point — labs, learning, and civic participation. The Terminal is where operators observe and verify.
              </p>
            </>
          ) : chamber ? (
            <>
              <div className="mb-3 flex items-center justify-center gap-2">
                <span className="text-2xl">{chamber.icon}</span>
                <div>
                  <div className="font-mono text-sm font-semibold text-slate-100">{chamber.name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-cyan-400/70">{chamber.role}</div>
                </div>
              </div>
              <p className="text-center text-xs leading-relaxed text-slate-400">
                {chamber.detail}
              </p>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3 md:px-6">
          <div className="flex gap-1">
            {Array.from({ length: CHAMBERS.length + 2 }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === step ? 'bg-cyan-400' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="rounded border border-slate-700 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              Skip
            </button>
            {isOutro ? (
              <button
                type="button"
                onClick={dismiss}
                className="rounded border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-cyan-300 hover:bg-cyan-500/20"
              >
                Enter Terminal
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="rounded border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-cyan-300 hover:bg-cyan-500/20"
              >
                {isIntro ? 'Begin Tour' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
