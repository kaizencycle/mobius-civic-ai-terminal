'use client';

import { useState } from 'react';
import { civicScienceBrief } from '@/lib/science/mock';

export default function CivicScienceBriefCard() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = [civicScienceBrief.title, civicScienceBrief.summary, ...civicScienceBrief.bullets.map((item) => `- ${item}`)].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Civic Brief</div>
          <div className="mt-1 text-sm text-slate-300">{civicScienceBrief.title}</div>
        </div>
        <button type="button" onClick={handleCopy} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-300">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <div className="text-sm text-white">{civicScienceBrief.summary}</div>
        <ul className="mt-3 space-y-2 text-xs text-slate-400">
          {civicScienceBrief.bullets.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
