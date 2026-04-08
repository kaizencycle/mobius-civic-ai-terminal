'use client';

import Link from 'next/link';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

export default function SentinelPage() {
  const { snapshot } = useTerminalSnapshot();
  const agents = (snapshot?.agents?.data ?? {}) as { agents?: Array<{ id: string; name: string; role: string; status: string; lastAction?: string; tier?: string }> };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(agents.agents ?? []).map((agent) => (
          <div key={agent.id} className="rounded border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-sm font-semibold">{agent.name}</div>
            <div className="text-xs text-slate-400">{agent.role}</div>
            <div className="mt-2 text-xs font-mono">status: {agent.status}</div>
            <div className="text-xs font-mono">tier: {agent.tier ?? '—'}</div>
            <div className="mt-2 text-xs text-slate-400">{agent.lastAction ?? 'No action recorded.'}</div>
            <Link href={`/terminal/journal/${encodeURIComponent(agent.name)}`} className="mt-3 inline-block text-xs text-cyan-300">View journal →</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
