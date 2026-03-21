'use client';

import { useState } from 'react';
import PublishEpiconModal from './PublishEpiconModal';

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

export default function QueryResultCard({
  result,
}: {
  result: QueryResult;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-slate-100">
        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
          Query Result
        </div>

        <div className="mt-2 text-lg font-semibold text-white">{result.title}</div>
        <div className="mt-2 text-sm text-slate-300">{result.summary}</div>

        <div className="mt-3 flex flex-wrap gap-2">
          {result.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-300"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Confidence: {result.confidence.toFixed(2)} · Agents: {result.agents_used.join(', ')}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            onClick={() => alert('Saved to dashboard')}
          >
            Save to Dashboard
          </button>

          <button
            className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-300 hover:bg-sky-500/20"
            onClick={() => setOpen(true)}
          >
            Publish to EPICON
          </button>

          <button
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            onClick={() => alert('Follow-up flow next')}
          >
            Ask Follow-Up
          </button>

          <a
            href="/epicon"
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Open EPICON Feed
          </a>
        </div>
      </div>

      <PublishEpiconModal
        open={open}
        onClose={() => setOpen(false)}
        result={result}
      />
    </>
  );
}
