'use client';

import { useEffect, useState } from 'react';
import type { PublicEpiconRecord } from '@/lib/epicon/feedStore';
import EpiconFeedCard from './EpiconFeedCard';

export default function EpiconFeedPage() {
  const [items, setItems] = useState<PublicEpiconRecord[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const res = await fetch('/api/epicon/feed', { cache: 'no-store' });
      const json = await res.json();
      if (mounted) setItems(json.items || []);
    }

    load();
    const interval = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
          EPICON Feed
        </div>
        <div className="mt-2 text-lg font-semibold text-white">
          Public Mobius Memory
        </div>
        <div className="mt-1 text-sm text-slate-400">
          Pending, developing, verified, and contradicted public knowledge artifacts.
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-slate-400">
          No public EPICON entries yet.
        </div>
      ) : (
        items.map((item) => <EpiconFeedCard key={item.id} item={item} />)
      )}
    </div>
  );
}
