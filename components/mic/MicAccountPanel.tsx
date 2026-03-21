'use client';

import { useEffect, useState } from 'react';

type MicAccount = {
  login: string;
  balance: number;
  mobius_id: string;
  role: string;
  locked: number;
  rewards_earned: number;
  mic_burned: number;
  updated_at: string;
};

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

export default function MicAccountPanel() {
  const [account, setAccount] = useState<MicAccount | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch('/api/mic/account?login=kaizencycle', {
          cache: 'no-store',
        });
        const json = await res.json();
        if (mounted) setAccount(json.account || null);
      } catch {
        if (mounted) setAccount(null);
      }
    }

    load();
    const interval = window.setInterval(load, 15000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  if (!account) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
        <div className="font-medium text-slate-200">MIC account unavailable.</div>
        <div className="mt-1 text-xs text-slate-500">
          Balance, stake, and burn history will appear here once the account feed responds.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">MIC Account</div>

      <div className="mt-2 text-lg font-semibold text-white">@{account.login}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
        {account.mobius_id} · {account.role}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniStat label="Balance" value={String(account.balance)} />
        <MiniStat label="Locked" value={String(account.locked)} />
        <MiniStat label="Rewards" value={String(account.rewards_earned)} />
        <MiniStat label="Burned" value={String(account.mic_burned)} />
      </div>

      <div className="mt-3 text-xs text-slate-500">Updated {new Date(account.updated_at).toLocaleString()}</div>
    </div>
  );
}
