'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import TopStatusBar from '@/components/terminal/TopStatusBar';
import SidebarNav from '@/components/terminal/SidebarNav';
import EpiconFeedPanel from '@/components/terminal/EpiconFeedPanel';
import AgentCortexPanel from '@/components/terminal/AgentCortexPanel';
import IntegrityMonitorCard from '@/components/terminal/IntegrityMonitorCard';
import TripwireWatchCard from '@/components/terminal/TripwireWatchCard';
import DetailInspectorRail from '@/components/terminal/DetailInspectorRail';
import CommandPalette from '@/components/terminal/CommandPalette';
import {
  getAgents,
  getEpiconFeed,
  getGISnapshot,
  getTripwires,
  isLiveAPI,
} from '@/lib/terminal/api';
import { navItems } from '@/lib/terminal/mock';
import type {
  Agent,
  EpiconItem,
  GISnapshot,
  InspectorTarget,
  NavKey,
  Tripwire,
  CommandResult,
} from '@/lib/terminal/types';
import {
  connectMobiusStream,
  type StreamMessage,
} from '@/lib/terminal/stream';

// ── Static data (module scope, not re-created per render) ────

const CATEGORY_MAP: Partial<Record<NavKey, EpiconItem['category']>> = {
  markets: 'market',
  geopolitics: 'geopolitical',
  governance: 'governance',
  infrastructure: 'infrastructure',
};

const CHAMBER_DESCRIPTIONS: Partial<Record<NavKey, string>> = {
  search: 'Use the Command Palette below to search across all data. Try /scan followed by a keyword.',
  settings: 'Terminal configuration and operator preferences. Feature coming in V2.',
  reflections: 'Agent reflection logs and cross-system annotations. Displaying active agents below.',
  ledger: 'Immutable event ledger. All EPICON events recorded by ECHO are shown below.',
};

const NAV_COMMANDS: Record<string, { nav: NavKey; label: string }> = {
  '/pulse': { nav: 'pulse', label: 'Pulse' },
  '/markets': { nav: 'markets', label: 'Markets' },
  '/market': { nav: 'markets', label: 'Markets' },
  '/ledger': { nav: 'ledger', label: 'Ledger' },
  '/geopolitics': { nav: 'geopolitics', label: 'Geopolitics' },
  '/geo': { nav: 'geopolitics', label: 'Geopolitics' },
  '/governance': { nav: 'governance', label: 'Governance' },
  '/reflections': { nav: 'reflections', label: 'Reflections' },
  '/infrastructure': { nav: 'infrastructure', label: 'Infrastructure' },
  '/infra': { nav: 'infrastructure', label: 'Infrastructure' },
  '/settings': { nav: 'settings', label: 'Settings' },
};

const NAV_LABEL_MAP = new Map(navItems.map((n) => [n.key, n.label]));

// ── Component ────────────────────────────────────────────────

export default function TerminalPage() {
  const [selectedNav, setSelectedNav] = useState<NavKey>('pulse');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [epicon, setEpicon] = useState<EpiconItem[]>([]);
  const [gi, setGi] = useState<GISnapshot | null>(null);
  const [tripwires, setTripwires] = useState<Tripwire[]>([]);
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget | null>(null);

  // Ref for stable handleCommand (avoids re-creating callback on every poll)
  const dataRef = useRef({ agents, epicon, gi, tripwires });
  dataRef.current = { agents, epicon, gi, tripwires };

  // Initial data load + polling fallback (only when live API is configured)
  useEffect(() => {
    let mounted = true;

    async function load() {
      const [agentsData, epiconData, giData, tripwireData] = await Promise.all([
        getAgents(),
        getEpiconFeed(),
        getGISnapshot(),
        getTripwires(),
      ]);

      if (!mounted) return;
      setAgents(agentsData);
      setEpicon(epiconData);
      setGi(giData);
      setTripwires(tripwireData);
      setInspectorTarget((prev) =>
        prev ?? (epiconData[0] ? { kind: 'epicon', data: epiconData[0] } : null),
      );
    }

    load();

    // Only poll when connected to a live API — mock data is static
    if (isLiveAPI) {
      const interval = setInterval(load, 15000);
      return () => { mounted = false; clearInterval(interval); };
    }
    return () => { mounted = false; };
  }, []);

  // SSE stream (when API is live)
  useEffect(() => {
    const source = connectMobiusStream((msg: StreamMessage) => {
      if (msg.type === 'agents') {
        setAgents(msg.agents);
      }

      if (msg.type === 'epicon') {
        setEpicon((prev) =>
          [msg.item, ...prev.filter((p) => p.id !== msg.item.id)].slice(0, 20),
        );
        setInspectorTarget((prev) =>
          prev ?? { kind: 'epicon', data: msg.item },
        );
      }

      if (msg.type === 'integrity') {
        setGi(msg.gi);
      }

      if (msg.type === 'tripwire') {
        setTripwires(msg.tripwires);
      }
    });

    return () => { source?.close(); };
  }, []);

  // Stable command handler (reads from ref, no deps on data state)
  const handleCommand = useCallback(
    (input: string): CommandResult => {
      const parts = input.trim().split(/\s+/);
      const cmd = parts[0]?.toLowerCase();
      const arg = parts.slice(1).join(' ').toLowerCase();
      const { agents, epicon, gi, tripwires } = dataRef.current;

      // Navigation commands (data-driven)
      if (cmd && cmd in NAV_COMMANDS) {
        const { nav, label } = NAV_COMMANDS[cmd];
        setSelectedNav(nav);
        return { ok: true, message: `Switched to ${label} view` };
      }

      switch (cmd) {
        case '/help':
          return {
            ok: true,
            message:
              'Commands: /scan [term], /agents, /tripwires, /gi, /pulse, /markets, /ledger, /geo, /governance, /settings, /clear',
          };

        case '/agents':
          setSelectedNav('agents');
          if (arg) {
            const found = agents.find(
              (a) => a.name.toLowerCase() === arg || a.id.toLowerCase() === arg,
            );
            if (found) {
              setInspectorTarget({ kind: 'agent', data: found });
              return { ok: true, message: `Inspecting agent ${found.name}` };
            }
            return { ok: false, message: `Agent "${arg}" not found` };
          }
          return { ok: true, message: `Showing ${agents.length} agents` };

        case '/tripwires':
          setSelectedNav('infrastructure');
          if (arg) {
            const found = tripwires.find(
              (t) =>
                t.id.toLowerCase() === arg ||
                t.label.toLowerCase().includes(arg),
            );
            if (found) {
              setInspectorTarget({ kind: 'tripwire', data: found });
              return { ok: true, message: `Inspecting tripwire ${found.id}` };
            }
            return { ok: false, message: `Tripwire "${arg}" not found` };
          }
          return {
            ok: true,
            message: `${tripwires.length} active tripwires`,
          };

        case '/gi':
        case '/integrity':
          setSelectedNav('governance');
          if (gi) {
            setInspectorTarget({ kind: 'gi', data: gi });
          }
          return {
            ok: true,
            message: gi ? `GI score: ${gi.score.toFixed(2)}` : 'Loading...',
          };

        case '/scan':
        case '/search': {
          setSelectedNav('search');
          if (!arg) return { ok: false, message: 'Usage: /scan [term]' };

          const matchedEpicon = epicon.find(
            (e) =>
              e.title.toLowerCase().includes(arg) ||
              e.summary.toLowerCase().includes(arg) ||
              e.category.toLowerCase().includes(arg),
          );
          if (matchedEpicon) {
            setInspectorTarget({ kind: 'epicon', data: matchedEpicon });
            return {
              ok: true,
              message: `Found: ${matchedEpicon.id} — ${matchedEpicon.title}`,
            };
          }

          const matchedAgent = agents.find(
            (a) =>
              a.name.toLowerCase().includes(arg) ||
              a.role.toLowerCase().includes(arg),
          );
          if (matchedAgent) {
            setSelectedNav('agents');
            setInspectorTarget({ kind: 'agent', data: matchedAgent });
            return {
              ok: true,
              message: `Found agent: ${matchedAgent.name}`,
            };
          }

          const matchedTripwire = tripwires.find(
            (t) =>
              t.label.toLowerCase().includes(arg) ||
              t.id.toLowerCase().includes(arg),
          );
          if (matchedTripwire) {
            setSelectedNav('infrastructure');
            setInspectorTarget({ kind: 'tripwire', data: matchedTripwire });
            return {
              ok: true,
              message: `Found tripwire: ${matchedTripwire.id}`,
            };
          }

          return { ok: false, message: `No results for "${arg}"` };
        }

        case '/clear':
          return { ok: true, message: 'History cleared' };

        default:
          return {
            ok: false,
            message: `Unknown command "${cmd}". Type /help for options.`,
          };
      }
    },
    [], // stable — reads from dataRef
  );

  if (!gi || !inspectorTarget) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300 font-mono">
        Loading Mobius Terminal...
      </div>
    );
  }

  // Derived view state
  const filteredEpicon = CATEGORY_MAP[selectedNav]
    ? epicon.filter((e) => e.category === CATEGORY_MAP[selectedNav])
    : epicon;

  const filteredAgents =
    selectedNav === 'pulse' || selectedNav === 'agents'
      ? agents
      : agents.filter((a) => a.status !== 'idle');

  const showEpicon = !['agents', 'settings', 'search'].includes(selectedNav);
  const showAgents = ['pulse', 'agents', 'reflections'].includes(selectedNav);
  const showMetrics = !['search', 'settings'].includes(selectedNav);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <TopStatusBar
        gi={gi.score}
        alertCount={tripwires.length}
        onNavigate={setSelectedNav}
        onShowGI={() => {
          setSelectedNav('governance');
          setInspectorTarget({ kind: 'gi', data: gi });
        }}
      />

      <div className="grid flex-1 grid-cols-12">
        <SidebarNav
          items={navItems}
          selected={selectedNav}
          onSelect={setSelectedNav}
        />

        <main className="col-span-7 border-r border-slate-800 bg-slate-950">
          <div className="grid h-full grid-rows-[auto_auto_auto_1fr] gap-4 p-4">
            {CHAMBER_DESCRIPTIONS[selectedNav] && (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-4">
                <div className="text-xs font-mono uppercase tracking-[0.2em] text-sky-300">
                  {NAV_LABEL_MAP.get(selectedNav)} Chamber
                </div>
                <div className="mt-2 text-sm font-sans text-slate-400">
                  {CHAMBER_DESCRIPTIONS[selectedNav]}
                </div>
              </div>
            )}

            {showEpicon && (
              <EpiconFeedPanel
                items={filteredEpicon}
                selectedId={
                  inspectorTarget.kind === 'epicon'
                    ? inspectorTarget.data.id
                    : ''
                }
                onSelect={(item) =>
                  setInspectorTarget({ kind: 'epicon', data: item })
                }
              />
            )}

            {showAgents && (
              <AgentCortexPanel
                agents={filteredAgents}
                selectedId={
                  inspectorTarget.kind === 'agent'
                    ? inspectorTarget.data.id
                    : undefined
                }
                onSelect={(agent) =>
                  setInspectorTarget({ kind: 'agent', data: agent })
                }
              />
            )}

            {showMetrics && (
              <section className="grid grid-cols-2 gap-4">
                <IntegrityMonitorCard
                  gi={gi}
                  onClick={() =>
                    setInspectorTarget({ kind: 'gi', data: gi })
                  }
                />
                <TripwireWatchCard
                  tripwires={tripwires}
                  selectedId={
                    inspectorTarget.kind === 'tripwire'
                      ? inspectorTarget.data.id
                      : undefined
                  }
                  onSelect={(tw) =>
                    setInspectorTarget({ kind: 'tripwire', data: tw })
                  }
                />
              </section>
            )}

            <CommandPalette onExecute={handleCommand} />
          </div>
        </main>

        <DetailInspectorRail target={inspectorTarget} />
      </div>

      <footer className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-4 py-2 text-xs font-mono text-slate-500">
        <span>MOBIUS TERMINAL V1 · Civic Bloomberg Interface</span>
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span>Ledger Connected · Lab4 OK · Shield OK · WS Mock Live</span>
        </div>
      </footer>
    </div>
  );
}
