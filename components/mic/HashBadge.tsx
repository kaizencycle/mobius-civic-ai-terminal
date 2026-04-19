'use client';

import { useState } from 'react';
import { shortHash } from '@/lib/mic/formatHash';

export function HashBadge({ label, hash }: { label: string; hash?: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copyHash() {
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-700 bg-slate-900/50 px-2 py-1.5 font-mono text-[11px] text-slate-300">
      <span className="font-medium text-slate-400">{label}:</span>
      <code className="break-all text-slate-200" title={hash ?? undefined}>
        {shortHash(hash)}
      </code>
      {hash ? (
        <button
          type="button"
          onClick={() => void copyHash()}
          className="ml-auto rounded border border-slate-600 px-2 py-0.5 text-[10px] text-slate-400 hover:border-slate-500 hover:text-slate-200"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      ) : null}
    </div>
  );
}
