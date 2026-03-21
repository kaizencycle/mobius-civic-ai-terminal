import type { MobiusIdentity } from '@/lib/identity/types';

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

export default function MobiusIdentityCard({ identity }: { identity: MobiusIdentity }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Mobius Identity</div>
      <div className="mt-2 text-xl font-semibold text-white">{identity.display_name}</div>
      <div className="mt-1 text-sm text-slate-400">@{identity.username}</div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="MobiusID" value={identity.mobius_id} />
        <MiniStat label="LedgerID" value={identity.ledger_id} />
        <MiniStat label="Role" value={identity.role} />
        <MiniStat label="Status" value={identity.status} />
        <MiniStat label="MII" value={identity.mii_score.toFixed(2)} />
        <MiniStat label="MIC" value={String(identity.mic_balance)} />
        <MiniStat label="EPICONs" value={String(identity.epicon_count)} />
        <MiniStat label="Agents" value={String(identity.agent_permissions.length)} />
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Agent Permissions</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {identity.agent_permissions.map((agent) => (
            <span
              key={agent}
              className="rounded-md bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-300"
            >
              {agent}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-500">
        Joined {new Date(identity.joined_at).toLocaleString()} · Last active{' '}
        {new Date(identity.last_active_at).toLocaleString()}
      </div>
    </div>
  );
}
