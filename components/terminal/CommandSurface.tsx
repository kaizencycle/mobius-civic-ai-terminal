'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, signOut, useSession } from 'next-auth/react';

type CommandOutput = {
  timestamp: string;
  command: string;
  type: 'success' | 'error' | 'info';
  response: string;
};

const COMMANDS = [
  '/help', '/status', '/agents', '/globe', '/pulse', '/signals', '/sentinel', '/ledger', '/tripwire', '/sentiment', '/mic', '/wallet', '/journal', '/ask', '/login', '/logout', '/whoami', '/epicon', '/gi', '/render', '/clear',
];

export default function CommandSurface() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [output, setOutput] = useState<CommandOutput[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false,
  );
  const [expanded, setExpanded] = useState(true);
  const touchStartY = useRef<number | null>(null);
  const isMountedRef = useRef(false);
  const { data: session } = useSession();
  const router = useRouter();

  const matches = useMemo(() => COMMANDS.filter((c) => c.startsWith(input.trim().toLowerCase())), [input]);

  useEffect(() => {
    let active = true;
    async function boot() {
      const integrity = await fetch('/api/integrity-status', {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
        .then((r) => r.json())
        .catch(() => null);
      if (!active || !integrity) return;
      const greeting = session?.user?.githubUsername
        ? `Welcome back, ${session.user.githubUsername}.`
        : 'Type /login to authenticate as operator.';
      setOutput([
        {
          timestamp: new Date().toISOString(),
          command: 'boot',
          type: 'info',
          response: `MOBIUS CIVIC TERMINAL — ${integrity.cycle}
GI ${integrity.global_integrity} · ${integrity.mode}
8 agents standing by.
Type /help for available commands.
${greeting}`,
        },
      ]);
    }
    void boot();
    return () => {
      active = false;
    };
  }, [session?.user?.githubUsername]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  // Read persisted collapse state on mount
  useEffect(() => {
    const stored = localStorage.getItem('mobius_console_collapsed');
    if (stored === 'true') setExpanded(false);
  }, []);

  // Persist collapse state and notify layout when it changes
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    localStorage.setItem('mobius_console_collapsed', String(!expanded));
    window.dispatchEvent(new CustomEvent('mobius:console-toggle', { detail: { collapsed: !expanded } }));
  }, [expanded]);

  function push(command: string, response: string, type: CommandOutput['type'] = 'info') {
    setOutput((prev) => [{ timestamp: new Date().toISOString(), command, response, type }, ...prev].slice(0, 25));
  }

  async function runCommand(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setHistory((prev) => [trimmed, ...prev].slice(0, 50));
    setHistoryIndex(-1);

    const [base, ...rest] = trimmed.split(' ');

    if (base === '/clear') {
      setOutput([]);
      return;
    }
    if (base === '/help') {
      push(trimmed, COMMANDS.join('\n'));
      return;
    }
    if (base === '/globe') {
      router.push('/terminal/globe');
      push(trimmed, '→ World State chamber', 'success');
      return;
    }
    if (base === '/pulse') {
      router.push('/terminal/pulse');
      push(trimmed, '→ Pulse chamber', 'success');
      return;
    }
    if (base === '/signals') {
      router.push('/terminal/signals');
      push(trimmed, '→ Signals chamber', 'success');
      return;
    }
    if (base === '/sentinel') {
      router.push('/terminal/sentinel');
      push(trimmed, '→ Sentinel chamber', 'success');
      return;
    }

    if (base === '/tripwire') {
      router.push('/terminal/tripwire');
      push(trimmed, '→ Tripwire chamber', 'success');
      return;
    }
    if (base === '/sentiment') {
      router.push('/terminal/sentiment');
      push(trimmed, '→ Sentiment chamber', 'success');
      return;
    }
    if (base === '/render') {
      const sub = (rest[0] ?? '').toLowerCase();
      const arg = rest.slice(1).join(' ').trim();
      if (sub === 'cycle') {
        const integrity = await fetch('/api/integrity-status', { cache: 'no-store' }).then((r) => r.json());
        const cycle = String(integrity.cycle ?? 'C-current');
        const gi = Number(integrity.global_integrity ?? 0);
        const res = await fetch('/api/globe/render-asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'cycle_hero',
            title: `${cycle} world state`,
            cycle,
            severity: gi > 0.85 ? 'nominal' : gi > 0.7 ? 'elevated' : 'critical',
            metadata: {
              giBand: gi > 0.85 ? 'nominal' : gi > 0.7 ? 'watch' : 'stressed',
              highlights: [`GI ${gi.toFixed(2)}`],
            },
          }),
        }).then((r) => r.json());
        if (res?.ok && res.imageUrl) {
          push(trimmed, `Cycle hero ready: ${res.imageUrl}${res.cached ? ' (cached)' : ''}`, 'success');
        } else {
          push(trimmed, res?.error ?? 'Render failed', 'error');
        }
        return;
      }
      if (sub === 'incident') {
        if (!arg) {
          push(trimmed, 'Usage: /render incident <title text>', 'error');
          return;
        }
        const res = await fetch('/api/globe/render-asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'incident_card', title: arg }),
        }).then((r) => r.json());
        if (res?.ok && res.imageUrl) {
          push(trimmed, `Incident art: ${res.imageUrl}`, 'success');
        } else {
          push(trimmed, res?.error ?? 'Render failed', 'error');
        }
        return;
      }
      if (sub === 'domain') {
        const dom = (rest[1] ?? '').toLowerCase();
        const allowed = ['civic', 'environ', 'financial', 'narrative', 'infrastructure', 'institutional'];
        if (!allowed.includes(dom)) {
          push(trimmed, `Usage: /render domain (${allowed.join('|')})`, 'error');
          return;
        }
        const res = await fetch('/api/globe/render-asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'domain_icon',
            title: `${dom} domain sigil`,
            domain: dom,
          }),
        }).then((r) => r.json());
        if (res?.ok && res.imageUrl) {
          push(trimmed, `Domain icon: ${res.imageUrl}`, 'success');
        } else {
          push(trimmed, res?.error ?? 'Render failed', 'error');
        }
        return;
      }
      push(trimmed, 'Usage: /render cycle | /render incident <title> | /render domain <civic|environ|…>', 'error');
      return;
    }
    if (base === '/ledger') {
      const sub = (rest[0] ?? '').toLowerCase();
      if (sub === 'stats') {
        const stats = await fetch('/api/ledger/proxy?target=stats', { cache: 'no-store' }).then((r) => r.json());
        push(trimmed, JSON.stringify(stats, null, 2), 'info');
        return;
      }
      if (sub === 'chain') {
        const chain = await fetch('/api/ledger/proxy?target=chain', { cache: 'no-store' }).then((r) => r.json());
        push(trimmed, JSON.stringify(chain, null, 2), 'info');
        return;
      }
      if (sub === 'seed') {
        const seed = await fetch('/api/admin/seed-ledger', {
          method: 'POST',
        }).then((r) => r.json());
        push(trimmed, JSON.stringify(seed, null, 2), seed?.ok ? 'success' : 'error');
        return;
      }
      router.push('/terminal/ledger');
      push(trimmed, '→ Ledger chamber', 'success');
      return;
    }
    if (base === '/wallet' || base === '/mic') {
      if (!session?.user) {
        push(trimmed, 'Login required — /login', 'error');
        return;
      }
      router.push('/terminal/mic');
      push(trimmed, '→ Wallet chamber', 'success');
      return;
    }
    if (base === '/login') {
      push(trimmed, 'Redirecting to GitHub...');
      await signIn('github', { callbackUrl: '/terminal' });
      return;
    }
    if (base === '/logout') {
      const name = session?.user?.githubUsername ?? 'operator';
      await signOut({ callbackUrl: '/terminal' });
      push(trimmed, `Session cleared. Goodbye, ${name}.`, 'success');
      return;
    }
    if (base === '/whoami') {
      const identity = await fetch('/api/identity/session', { cache: 'no-store' }).then((r) => r.json());
      if (!identity.user) {
        push(trimmed, 'Not logged in. Type /login to authenticate.', 'error');
      } else {
        push(trimmed, `${identity.user.username} · ${identity.user.mobius_id}\nMII ${identity.user.mii_score} · MIC ${identity.user.mic_balance} · Tier: ${identity.user.tier}`, 'success');
      }
      return;
    }

    if (base === '/status' || base === '/gi') {
      const [integrity, kv] = await Promise.all([
        fetch('/api/integrity-status', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/kv/health', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (base === '/gi') {
        const gi = Number(integrity.global_integrity ?? 0);
        const bar = `${'█'.repeat(Math.round(gi * 16)).padEnd(16, '░')}`;
        push(trimmed, `GI ${gi.toFixed(2)}  ${bar}  ${String(integrity.mode ?? 'unknown').toUpperCase()}`, 'success');
      } else {
        const activeKeys = Object.values(kv.keys ?? {}).filter(Boolean).length;
        push(trimmed, `MOBIUS ${integrity.cycle} · GI ${integrity.global_integrity} · ${integrity.mode}\nKV: ${activeKeys} keys active\nSource: ${integrity.source ?? 'unknown'}\nAgents: 8/8`, 'success');
      }
      return;
    }

    if (base === '/agents') {
      const agents = await fetch('/api/agents/status', { cache: 'no-store' }).then((r) => r.json());
      const text = (agents.agents ?? []).map((agent: { name: string; status: string }) => `${agent.name} · ${agent.status}`).join('\n');
      push(trimmed, text || 'No agents found', 'info');
      return;
    }

    if (base === '/journal') {
      if (!rest[0]) {
        router.push('/terminal/journal');
        push(trimmed, '→ Journal chamber', 'success');
        return;
      }
      const agent = rest[0] ?? '';
      const url = agent ? `/api/agents/journal?agent=${encodeURIComponent(agent)}&limit=3` : '/api/agents/journal?limit=3';
      const journal = await fetch(url, { cache: 'no-store' }).then((r) => r.json());
      const text = (journal.entries ?? []).slice(0, 3).map((entry: { cycle: string; observation: string }) => `[${entry.cycle}] ${entry.observation}`).join('\n');
      push(trimmed, text || 'No journal entries', 'info');
      return;
    }

    if (base === '/epicon') {
      const id = rest[0];
      if (!id) {
        push(trimmed, 'Usage: /epicon [id]', 'error');
        return;
      }
      const feed = await fetch('/api/epicon/feed?limit=100', { cache: 'no-store' }).then((r) => r.json());
      const item = (feed.items ?? []).find((row: { id: string }) => row.id === id);
      push(trimmed, item ? JSON.stringify(item, null, 2) : `No EPICON entry found for ${id}`, item ? 'success' : 'error');
      return;
    }

    if (base === '/ask') {
      const agent = rest[0] ?? 'ATLAS';
      push(trimmed, `${agent} is listening...`, 'info');
      return;
    }

    push(trimmed, `Unknown command: ${base}`, 'error');
  }

  const isOpen = expanded;

  return (
    <div className="fixed bottom-7 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950 font-mono text-[11px] tracking-wide">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        onTouchStart={(event) => {
          touchStartY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchEnd={(event) => {
          const startY = touchStartY.current;
          const endY = event.changedTouches[0]?.clientY;
          touchStartY.current = null;
          if (!isMobile || startY == null || endY == null) return;
          if (endY - startY > 36) setExpanded(false);
        }}
        className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-slate-400"
        aria-expanded={isOpen}
        aria-controls="mobius-command-console"
      >
        <span>{isOpen ? '▾ Console' : '▸ Console'}</span>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-[9px]">
          {isOpen ? 'Collapse' : 'Open'}
        </span>
      </button>

      <div
        id="mobius-command-console"
        className={`${isOpen ? 'max-h-[56vh] px-3 py-2' : 'max-h-0 px-3 py-0'} overflow-hidden transition-all duration-300`}
      >
        <div className="mb-2 max-h-40 overflow-y-auto">
          {output.map((row) => (
            <div key={`${row.timestamp}-${row.command}`} className="mb-2 border-b border-slate-900 pb-2">
              <div className="text-slate-500">{row.timestamp}</div>
              <div className="text-slate-500">&gt; {row.command}</div>
              <pre className={row.type === 'error' ? 'whitespace-pre-wrap text-red-400' : row.type === 'success' ? 'whitespace-pre-wrap text-emerald-400' : 'whitespace-pre-wrap text-slate-300'}>{row.response}</pre>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">&gt;</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void runCommand(input);
                setInput('');
              }
              if (event.key === 'Escape') setInput('');
              if (event.key === 'ArrowUp' && history.length > 0) {
                event.preventDefault();
                const next = Math.min(historyIndex + 1, history.length - 1);
                setHistoryIndex(next);
                setInput(history[next] ?? '');
              }
              if (event.key === 'ArrowDown' && history.length > 0) {
                event.preventDefault();
                const next = Math.max(historyIndex - 1, -1);
                setHistoryIndex(next);
                setInput(next === -1 ? '' : history[next] ?? '');
              }
              if (event.key === 'Tab') {
                event.preventDefault();
                if (matches[0]) setInput(matches[0]);
              }
            }}
            className="w-full bg-transparent text-sky-300 outline-none"
            placeholder="Type /help"
          />
        </div>
      </div>
    </div>
  );
}
