'use client';

import { useEffect, useMemo, useState } from 'react';
import { giModeConfig } from '@/lib/gi/mode';
import type { IntegrityStatusResponse } from '@/lib/mock/integrityStatus';

type QueryResult = {
  id: string;
  query: string;
  title: string;
  summary: string;
  sources: readonly string[];
  tags: readonly string[];
  confidence: number;
  agents_used: readonly string[];
  created_at: string;
};

type GIData = Pick<
  IntegrityStatusResponse,
  'global_integrity' | 'mode' | 'terminal_status' | 'primary_driver' | 'summary'
>;

const giModeTone = {
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  yellow: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  red: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
} as const;

const giModeBanner = {
  green:
    'System integrity is healthy. Publication friction is lower and exploratory contribution is encouraged.',
  yellow:
    'System integrity is under moderate stress. Public claims require balanced commitment.',
  red: 'System integrity is fragile. Public claims require higher commitment and stronger caution.',
} as const;

export default function PublishEpiconModal({
  open,
  onClose,
  result,
}: {
  open: boolean;
  onClose: () => void;
  result: QueryResult;
}) {
  const [publicationMode, setPublicationMode] = useState<'public' | 'private_draft'>('private_draft');
  const [stake, setStake] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [gi, setGi] = useState<GIData | null>(null);
  const [giLoading, setGiLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    let active = true;

    async function loadGi() {
      try {
        setGiLoading(true);
        const res = await fetch('/api/integrity-status', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('Failed to load GI status');
        }
        const json: IntegrityStatusResponse = await res.json();
        if (!active) return;
        setGi({
          global_integrity: json.global_integrity,
          mode: json.mode,
          terminal_status: json.terminal_status,
          primary_driver: json.primary_driver,
          summary: json.summary,
        });
      } catch {
        if (active) {
          setGi(null);
        }
      } finally {
        if (active) {
          setGiLoading(false);
        }
      }
    }

    loadGi();

    return () => {
      active = false;
    };
  }, [open]);

  const mode = gi?.mode ?? 'yellow';
  const modeConfig = giModeConfig[mode];
  const availableStakes = useMemo<number[]>(
    () => [...modeConfig.minStakeOptions],
    [modeConfig.minStakeOptions],
  );

  useEffect(() => {
    if (publicationMode !== 'public') return;

    if (!availableStakes.includes(stake)) {
      setStake(availableStakes[0] ?? 0);
    }
  }, [availableStakes, publicationMode, stake]);

  if (!open) return null;

  async function handleSubmit() {
    try {
      setLoading(true);

      const res = await fetch('/api/epicon/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_result_id: result.id,
          title: result.title,
          summary: result.summary,
          sources: result.sources,
          tags: result.tags,
          confidence: result.confidence,
          agents_used: result.agents_used,
          publication_mode: publicationMode,
          mic_stake: publicationMode === 'public' ? stake : 0,
          submitted_by_login: 'kaizencycle',
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Publish failed');
      }

      onClose();
      alert(
        publicationMode === 'public'
          ? 'EPICON published in pending state and added to the public feed'
          : 'Private draft saved',
      );
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Unable to complete publish flow');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-5 text-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-400">
              <span>Publish to EPICON</span>
              <span
                className={`rounded-full border px-2 py-1 text-[10px] tracking-[0.2em] ${giModeTone[mode]}`}
              >
                {modeConfig.label}
              </span>
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Turn this result into a public Mobius ledger entry or save it privately.
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className={`mt-4 rounded-xl border p-4 ${giModeTone[mode]}`}>
          <div className="text-[11px] uppercase tracking-[0.16em]">GI Mode · {modeConfig.label}</div>
          <div className="mt-2 text-sm">{giModeBanner[mode]}</div>
          {gi ? (
            <div className="mt-2 text-xs opacity-80">
              GI {(gi.global_integrity * 100).toFixed(0)}% · {gi.terminal_status} · {gi.primary_driver}
            </div>
          ) : giLoading ? (
            <div className="mt-2 text-xs opacity-80">Loading live integrity status…</div>
          ) : (
            <div className="mt-2 text-xs opacity-80">
              Live integrity status unavailable. Using stabilization defaults until the feed recovers.
            </div>
          )}
          {gi?.summary ? <div className="mt-2 text-xs opacity-80">{gi.summary}</div> : null}
        </div>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="text-sm font-semibold text-white">{result.title}</div>
          <div className="mt-2 text-sm text-slate-300">{result.summary}</div>
          <div className="mt-3 text-xs text-slate-500">
            Confidence: {result.confidence.toFixed(2)} · Agents: {result.agents_used.join(', ')}
          </div>
        </div>

        <div className="mt-5">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Publication Mode</div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setPublicationMode('private_draft')}
              className={`rounded-lg border px-3 py-2 text-sm ${
                publicationMode === 'private_draft'
                  ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                  : 'border-slate-700 bg-slate-950 text-slate-300'
              }`}
            >
              Private Draft
            </button>
            <button
              onClick={() => {
                setPublicationMode('public');
                setStake(availableStakes[0] ?? 0);
              }}
              className={`rounded-lg border px-3 py-2 text-sm ${
                publicationMode === 'public'
                  ? 'border-violet-500/30 bg-violet-500/10 text-violet-300'
                  : 'border-slate-700 bg-slate-950 text-slate-300'
              }`}
            >
              Public EPICON
            </button>
          </div>
        </div>

        {publicationMode === 'public' ? (
          <div className="mt-5">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">MIC Stake</div>
            <div className="mt-3 flex gap-2">
              {availableStakes.map((value) => (
                <button
                  key={value}
                  onClick={() => setStake(value)}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    stake === value
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      : 'border-slate-700 bg-slate-950 text-slate-300'
                  }`}
                >
                  {value} MIC
                </button>
              ))}
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Stake options adapt to current GI mode. Higher system stress requires stronger public commitment.
            </div>
          </div>
        ) : null}

        <div className="mt-5 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">
          Asking questions is free. Staking only applies when making a public claim.
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
          >
            {loading ? 'Publishing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
