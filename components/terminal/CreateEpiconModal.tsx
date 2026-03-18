'use client';

import { useState } from 'react';

type EpiconDraft = {
  title: string;
  summary: string;
  category: 'geopolitical' | 'market' | 'governance' | 'infrastructure';
  confidence: 'low' | 'medium' | 'high';
  source1: string;
  source2: string;
  source3: string;
  tags: string;
};

const EMPTY_DRAFT: EpiconDraft = {
  title: '',
  summary: '',
  category: 'geopolitical',
  confidence: 'medium',
  source1: '',
  source2: '',
  source3: '',
  tags: '',
};

const CATEGORIES: { value: EpiconDraft['category']; label: string }[] = [
  { value: 'geopolitical', label: 'Geopolitical' },
  { value: 'market', label: 'Market' },
  { value: 'governance', label: 'Governance' },
  { value: 'infrastructure', label: 'Infrastructure' },
];

export default function CreateEpiconModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: EpiconDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<EpiconDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const canSubmit =
    draft.title.trim().length > 0 &&
    draft.summary.trim().length > 0 &&
    draft.source1.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(draft);
      setDraft(EMPTY_DRAFT);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const set = (field: keyof EpiconDraft) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setDraft((d) => ({ ...d, [field]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.24em] text-sky-300">
              Create EPICON
            </div>
            <div className="mt-1 text-sm text-slate-400">
              Submit a structured signal for Mobius agent processing
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1 text-sm font-mono text-slate-300 hover:bg-slate-800 transition"
          >
            ESC
          </button>
        </div>

        {/* Pipeline visualization */}
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-slate-700 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
          <span className="text-sky-400">You submit</span>
          <span>→</span>
          <span className="text-cyan-400">ECHO logs</span>
          <span>→</span>
          <span className="text-orange-400">HERMES routes</span>
          <span>→</span>
          <span className="text-amber-400">ZEUS verifies</span>
          <span>→</span>
          <span className="text-violet-400">ATLAS synthesizes</span>
        </div>

        {/* Form */}
        <div className="mt-5 space-y-4">
          {/* Title */}
          <label className="block">
            <div className="mb-1.5 text-xs font-mono uppercase tracking-[0.18em] text-slate-400">
              Title <span className="text-rose-400">*</span>
            </div>
            <input
              value={draft.title}
              onChange={set('title')}
              placeholder="Ex: Shipping disruption reported near Strait of Hormuz"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono text-white outline-none placeholder:text-slate-600 focus:border-sky-500/40"
            />
          </label>

          {/* Summary */}
          <label className="block">
            <div className="mb-1.5 text-xs font-mono uppercase tracking-[0.18em] text-slate-400">
              Summary <span className="text-rose-400">*</span>
            </div>
            <textarea
              value={draft.summary}
              onChange={set('summary')}
              placeholder="Describe what happened, what you observed, and why it matters."
              rows={4}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono text-white outline-none placeholder:text-slate-600 focus:border-sky-500/40 resize-none"
            />
          </label>

          {/* Category + Confidence */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="mb-1.5 text-xs font-mono uppercase tracking-[0.18em] text-slate-400">
                Category
              </div>
              <select
                value={draft.category}
                onChange={set('category')}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono text-white outline-none focus:border-sky-500/40"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value} className="bg-slate-950">
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <div className="mb-1.5 text-xs font-mono uppercase tracking-[0.18em] text-slate-400">
                Confidence Estimate
              </div>
              <select
                value={draft.confidence}
                onChange={set('confidence')}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono text-white outline-none focus:border-sky-500/40"
              >
                <option value="low" className="bg-slate-950">Low</option>
                <option value="medium" className="bg-slate-950">Medium</option>
                <option value="high" className="bg-slate-950">High</option>
              </select>
            </label>
          </div>

          {/* Sources */}
          <div className="space-y-2">
            <div className="text-xs font-mono uppercase tracking-[0.18em] text-slate-400">
              Sources <span className="text-rose-400">*</span>
              <span className="ml-2 normal-case tracking-normal text-slate-500">min 1 required</span>
            </div>
            <input
              value={draft.source1}
              onChange={set('source1')}
              placeholder="https:// (primary source)"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono text-white outline-none placeholder:text-slate-600 focus:border-sky-500/40"
            />
            <input
              value={draft.source2}
              onChange={set('source2')}
              placeholder="https:// (optional cross-reference)"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono text-white outline-none placeholder:text-slate-600 focus:border-sky-500/40"
            />
            <input
              value={draft.source3}
              onChange={set('source3')}
              placeholder="https:// (optional third source)"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono text-white outline-none placeholder:text-slate-600 focus:border-sky-500/40"
            />
          </div>

          {/* Tags */}
          <label className="block">
            <div className="mb-1.5 text-xs font-mono uppercase tracking-[0.18em] text-slate-400">
              Tags <span className="normal-case tracking-normal text-slate-500">comma-separated</span>
            </div>
            <input
              value={draft.tags}
              onChange={set('tags')}
              placeholder="iran, energy, shipping, hormuz"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono text-white outline-none placeholder:text-slate-600 focus:border-sky-500/40"
            />
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm font-mono text-rose-300">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex items-center justify-between">
          <div className="text-xs font-mono text-slate-500">
            Status will be set to <span className="text-sky-300">pending</span> · ZEUS verifies after submission
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-mono text-slate-300 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              disabled={!canSubmit || submitting}
              onClick={handleSubmit}
              className={`rounded-lg border px-4 py-2 text-sm font-mono transition ${
                canSubmit && !submitting
                  ? 'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'
                  : 'cursor-not-allowed border-slate-700 bg-slate-800 text-slate-500'
              }`}
            >
              {submitting ? 'Submitting...' : 'Submit EPICON'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
