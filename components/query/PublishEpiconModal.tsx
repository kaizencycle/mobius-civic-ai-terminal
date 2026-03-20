'use client';

import { useState } from 'react';

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
        }),
      });

      if (!res.ok) {
        throw new Error('Publish failed');
      }

      onClose();
      alert(
        publicationMode === 'public'
          ? 'EPICON published in pending state'
          : 'Private draft saved',
      );
    } catch (err) {
      console.error(err);
      alert('Unable to complete publish flow');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-5 text-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Publish to EPICON
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

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="text-sm font-semibold text-white">{result.title}</div>
          <div className="mt-2 text-sm text-slate-300">{result.summary}</div>
          <div className="mt-3 text-xs text-slate-500">
            Confidence: {result.confidence.toFixed(2)} · Agents: {result.agents_used.join(', ')}
          </div>
        </div>

        <div className="mt-5">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
            Publication Mode
          </div>
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
              onClick={() => setPublicationMode('public')}
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
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
              MIC Stake
            </div>
            <div className="mt-3 flex gap-2">
              {[0, 1, 3, 5].map((value) => (
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
              Verified → stake returned + future reward layer
              <br />
              Inconclusive → stake returned
              <br />
              Contradicted → stake eligible for burn in later settlement layer
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
