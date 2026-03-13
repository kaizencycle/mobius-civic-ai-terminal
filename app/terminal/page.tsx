'use client';

import { useEffect, useState, useCallback } from 'react';
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

export default function TerminalPage() {
  const [selectedNav, setSelectedNav] = useState<NavKey>('pulse');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [epicon, setEpicon] = useState<EpiconItem[]>([]);
  const [gi, setGi] = useState<GISnapshot | null>(null);
  const [tripwires, setTripwires] = useState<Tripwire[]>([]);
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget | null>(null);
  const [clock, setClock] = useState('');
  const [command, setCommand] = useState('');

  // Live clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'America/New_York',
      });
      setClock(formatter.format(now));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initial data load + polling fallback
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
    const interval = setInterval(load, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
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

    return () => {
      source?.close();
    };
  }, []);

  // Navigation handler — also updates inspector when switching chambers
  const handleNavigate = useCallback(
    (key: NavKey) => {
      setSelectedNav(key);
    },
    [],
  );

  // Command execution
  const handleCommand = useCallback(
    (input: string): CommandResult => {
      const parts = input.trim().split(/\s+/);
      const cmd = parts[0]?.toLowerCase();
      const arg = parts.slice(1).join(' ').toLowerCase();

      switch (cmd) {
        case '/help':
          return {
            ok: true,
            message:
              'Commands: /scan [term], /agents, /tripwires, /gi, /pulse, /markets, /ledger, /geopolitics, /governance, /settings, /clear',
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

        case '/pulse':
          setSelectedNav('pulse');
          return { ok: true, message: 'Switched to Pulse view' };

        case '/markets':
        case '/market':
          setSelectedNav('markets');
          return { ok: true, message: 'Switched to Markets view' };

        case '/ledger':
          setSelectedNav('ledger');
          return { ok: true, message: 'Switched to Ledger view' };

        case '/geopolitics':
        case '/geo':
          setSelectedNav('geopolitics');
          return { ok: true, message: 'Switched to Geopolitics view' };

        case '/governance':
          setSelectedNav('governance');
          return { ok: true, message: 'Switched to Governance view' };

        case '/reflections':
          setSelectedNav('reflections');
          return { ok: true, message: 'Switched to Reflections view' };

        case '/infrastructure':
        case '/infra':
          setSelectedNav('infrastructure');
          return { ok: true, message: 'Switched to Infrastructure view' };

        case '/settings':
          setSelectedNav('settings');
          return { ok: true, message: 'Switched to Settings view' };

        case '/clear':
          return { ok: true, message: 'History cleared' };

        default:
          return {
            ok: false,
            message: `Unknown command "${cmd}". Type /help for options.`,
          };
      }
    },
    [agents, epicon, gi, tripwires],
  );

  if (!gi || !inspectorTarget) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300 font-mono">
        Loading Mobius Terminal...
      </div>
    );
  }

  // Filter epicon by category based on selected nav chamber
  const categoryMap: Partial<Record<NavKey, EpiconItem['category']>> = {
    markets: 'market',
    geopolitics: 'geopolitical',
    governance: 'governance',
    infrastructure: 'infrastructure',
  };

  const filteredEpicon = categoryMap[selectedNav]
    ? epicon.filter((e) => e.category === categoryMap[selectedNav])
    : epicon;

  // Filter agents: show all on pulse/agents, otherwise show active only
  const filteredAgents =
    selectedNav === 'pulse' || selectedNav === 'agents'
      ? agents
      : agents.filter((a) => a.status !== 'idle');

  // Determine which sections to show based on nav
  const showEpicon = !['agents', 'settings', 'search'].includes(selectedNav);
  const showAgents = ['pulse', 'agents', 'reflections'].includes(selectedNav);
  const showMetrics = !['search', 'settings'].includes(selectedNav);

  // Chamber-specific empty states
  const chamberDescriptions: Partial<Record<NavKey, string>> = {
    search: 'Use the Command Palette below to search across all data. Try /scan followed by a keyword.',
    settings: 'Terminal configuration and operator preferences. Feature coming in V2.',
    reflections: 'Agent reflection logs and cross-system annotations. Displaying active agents below.',
    ledger: 'Immutable event ledger. All EPICON events recorded by ECHO are shown below.',
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen flex-col">
        <TopStatusBar
          clock={clock}
          gi={gi.score}
          alertCount={tripwires.length}
          onNavigate={handleNavigate}
          onShowGI={() => {
            setSelectedNav('governance');
            setInspectorTarget({ kind: 'gi', data: gi });
          }}
        />

        <div className="grid flex-1 grid-cols-12">
          <SidebarNav
            items={navItems}
            selected={selectedNav}
            onSelect={handleNavigate}
          />

          <main className="col-span-7 border-r border-slate-800 bg-slate-950">
            <div className="grid h-full grid-rows-[auto_auto_auto_1fr] gap-4 p-4">
              {chamberDescriptions[selectedNav] && (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-4">
                  <div className="text-xs font-mono uppercase tracking-[0.2em] text-sky-300">
                    {navItems.find((n) => n.key === selectedNav)?.label} Chamber
                  </div>
                  <div className="mt-2 text-sm font-sans text-slate-400">
                    {chamberDescriptions[selectedNav]}
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

              <CommandPalette
                value={command}
                onChange={setCommand}
                onExecute={handleCommand}
              />
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
    </div>
  );
}
