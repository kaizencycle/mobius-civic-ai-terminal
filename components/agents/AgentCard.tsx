type Agent = {
  id: string;
  name: string;
  role: string;
  tier: string;
  status: 'alive' | 'idle' | 'offline';
  color: string;
  detail: string;
};

function colorClasses(color: string) {
  switch (color) {
    case 'cerulean':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
    case 'gold':
      return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300';
    case 'coral':
      return 'border-orange-500/30 bg-orange-500/10 text-orange-300';
    case 'amber':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'jade':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'bronze':
      return 'border-orange-700/30 bg-orange-700/10 text-orange-200';
    case 'silver':
      return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
    case 'rose':
      return 'border-pink-500/30 bg-pink-500/10 text-pink-300';
    default:
      return 'border-slate-700 bg-slate-900 text-slate-300';
  }
}

function statusClasses(status: Agent['status'] | string) {
  switch (status) {
    case 'alive':
    case 'active':
      return 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10';
    case 'idle':
    case 'unknown':
      return 'text-amber-300 border-amber-500/20 bg-amber-500/10';
    case 'offline':
      return 'text-rose-300 border-rose-500/20 bg-rose-500/10';
    default:
      return 'text-slate-300 border-slate-700 bg-slate-900';
  }
}

export default function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className={`inline-flex rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${colorClasses(agent.color)}`}
          >
            {agent.name}
          </div>
          <div className="mt-3 text-sm font-semibold text-white">{agent.role}</div>
        </div>

        <div
          className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${statusClasses(agent.status)}`}
        >
          {agent.status}
        </div>
      </div>

      <div className="mt-3 text-xs uppercase tracking-[0.12em] text-slate-500">Tier: {agent.tier}</div>

      <div className="mt-3 text-sm text-slate-300">{agent.detail}</div>
    </div>
  );
}
