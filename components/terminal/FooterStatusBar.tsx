'use client';

import { useEffect, useMemo, useState } from 'react';

type KvHealth = { ok?: boolean };

export default function FooterStatusBar() {
  const [kv, setKv] = useState<'healthy' | 'degraded'>('degraded');
  const [heartbeat, setHeartbeat] = useState<string>('—');
  const runtimeLabel = useMemo(() => (kv === 'healthy' ? 'nominal' : 'guarded'), [kv]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const kvHealth = await fetch('/api/kv/health', { cache: 'no-store' })
        .then((r) => r.json() as Promise<KvHealth>)
        .catch(() => ({ ok: false }));
      if (!mounted) return;
      setKv(kvHealth.ok ? 'healthy' : 'degraded');
      setHeartbeat(new Date().toISOString());
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-1 text-[10px] font-mono uppercase tracking-wide text-slate-400">
      Runtime {runtimeLabel} · KV {kv} · Last heartbeat {heartbeat === '—' ? '—' : new Date(heartbeat).toISOString()}
    </div>
  );
}
