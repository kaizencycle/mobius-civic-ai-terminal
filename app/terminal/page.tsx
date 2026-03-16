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
import LedgerPanel from '@/components/terminal/LedgerPanel';
import SubstrateStatusCard from '@/components/terminal/SubstrateStatusCard';
import CivicRadarPanel from '@/components/terminal/CivicRadarPanel';
import {
  getAgents,
  getEpiconFeed,
  getGISnapshot,
  getTripwires,
  getEchoFeed,
  isLiveAPI,
} from '@/lib/terminal/api';
import {
  navItems,
  mockLedger,
  mockSentinels,
  mockCivicAlerts,
} from '@/lib/terminal/mock';
import type {
  Agent,
  EpiconItem,
  GISnapshot,
  LedgerEntry,
  CivicRadarAlert,
  InspectorTarget,
  NavKey,
  Tripwire,
  CommandResult,
} from '@/lib/terminal/types';
import {
  connectMobiusStream,
  type StreamMessage,
  type StreamConnectionStatus,
} from '@/lib/terminal/stream';
import type { StreamStatus } from '@/components/terminal/TopStatusBar';

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
  const [streamStatus, setStreamStatus] = useState<StreamStatus>(isLiveAPI ? 'reconnecting' : 'offline');
  const [echoLedger, setEchoLedger] = useState<LedgerEntry[]>([]);
  const [echoAlerts, setEchoAlerts] = useState<CivicRadarAlert[]>([]);

  // Ref for stable handleCommand (avoids re-creating callback on every poll)
  const dataRef = useRef({ agents, epicon, gi, tripwires, echoLedger, echoAlerts });
  dataRef.current = { agents, epicon, gi, tripwires, echoLedger, echoAlerts };

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

    if (isLiveAPI) {
      const interval = setInterval(load, 15000);
      return () => { mounted = false; clearInterval(interval); };
    }
    return () => { mounted = false; };
  }, []);

  // SSE stream (when API is live)
  useEffect(() => {
    const source = connectMobiusStream(
      (msg: StreamMessage) => {
        if (msg.type === 'agents') setAgents(msg.agents);
        if (msg.type === 'epicon') {
          setEpicon((prev) =>
            [msg.item, ...prev.filter((p) => p.id !== msg.item.id)].slice(0, 20),
          );
          setInspectorTarget((prev) =>
            prev ?? { kind: 'epicon', data: msg.item },
          );
        }
        if (msg.type === 'integrity') setGi(msg.gi);
        if (msg.type === 'tripwire') setTripwires(msg.tripwires);
      },
      (status: StreamConnectionStatus) => setStreamStatus(status),
    );

    return () => { source?.close(); };
  }, []);

  // ECHO live feed — fetches from internal API, merges with mock data
  useEffect(() => {
    let mounted = true;

    async function loadEcho() {
      const feed = await getEchoFeed();
      if (!mounted || !feed) return;

      // Merge live ECHO epicon items with existing feed (live first, dedup by id)
      if (feed.epicon.length > 0) {
        setEpicon((prev) => {
          const liveIds = new Set(feed.epicon.map((e) => e.id));
          return [...feed.epicon, ...prev.filter((p) => !liveIds.has(p.id))].slice(0, 30);
        });
      }

      setEchoLedger(feed.ledger);
      setEchoAlerts(feed.alerts);
    }

    loadEcho();

    // Re-fetch ECHO data every 2 hours (matches cron interval)
    const interval = setInterval(loadEcho, 2 * 60 * 60 * 1000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Stable command handler
  const handleCommand = useCallback(
    (input: string): CommandResult => {
      const parts = input.trim().split(/\s+/);
      const cmd = parts[0]?.toLowerCase();
      const arg = parts.slice(1).join(' ').toLowerCase();
      const { agents, epicon, gi, tripwires, echoLedger, echoAlerts } = dataRef.current;

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
              'Commands: /scan [term], /agents, /tripwires, /gi, /ledger, /sentinels, /radar, /echo, /clear',
          };

        case '/echo': {
          // Trigger manual ECHO ingest
          fetch('/api/echo/ingest', { method: 'POST' })
            .then((r) => r.json())
            .then(() => getEchoFeed().then((feed) => {
              if (!feed) return;
              if (feed.epicon.length > 0) {
                setEpicon((prev) => {
                  const liveIds = new Set(feed.epicon.map((e) => e.id));
                  return [...feed.epicon, ...prev.filter((p) => !liveIds.has(p.id))].slice(0, 30);
                });
              }
              setEchoLedger(feed.ledger);
              setEchoAlerts(feed.alerts);
            }))
            .catch(() => { /* silent */ });
          return { ok: true, message: 'ECHO ingest triggered. Live data will refresh shortly.' };
        }

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
          return { ok: true, message: `${tripwires.length} active tripwires` };

        case '/gi':
        case '/integrity':
          setSelectedNav('governance');
          if (gi) setInspectorTarget({ kind: 'gi', data: gi });
          return {
            ok: true,
            message: gi ? `GI score: ${gi.score.toFixed(2)}` : 'Loading...',
          };

        case '/sentinels':
        case '/sentinel':
          setSelectedNav('governance');
          if (arg) {
            const found = mockSentinels.find(
              (s) => s.name.toLowerCase() === arg || s.id.toLowerCase() === arg,
            );
            if (found) {
              setInspectorTarget({ kind: 'sentinel', data: found });
              return { ok: true, message: `Inspecting sentinel ${found.name}` };
            }
            return { ok: false, message: `Sentinel "${arg}" not found` };
          }
          return { ok: true, message: `${mockSentinels.length} sentinels in council` };

        case '/radar':
        case '/alerts':
          setSelectedNav('geopolitics');
          return { ok: true, message: `${mockCivicAlerts.length + echoAlerts.length} civic radar alerts` };

        case '/scan':
        case '/search': {
          setSelectedNav('search');
          if (!arg) return { ok: false, message: 'Usage: /scan [term]' };

          // Search epicon
          const matchedEpicon = epicon.find(
            (e) =>
              e.title.toLowerCase().includes(arg) ||
              e.summary.toLowerCase().includes(arg) ||
              e.category.toLowerCase().includes(arg),
          );
          if (matchedEpicon) {
            setInspectorTarget({ kind: 'epicon', data: matchedEpicon });
            return { ok: true, message: `Found: ${matchedEpicon.id} — ${matchedEpicon.title}` };
          }

          // Search agents
          const matchedAgent = agents.find(
            (a) =>
              a.name.toLowerCase().includes(arg) ||
              a.role.toLowerCase().includes(arg),
          );
          if (matchedAgent) {
            setSelectedNav('agents');
            setInspectorTarget({ kind: 'agent', data: matchedAgent });
            return { ok: true, message: `Found agent: ${matchedAgent.name}` };
          }

          // Search tripwires
          const matchedTripwire = tripwires.find(
            (t) =>
              t.label.toLowerCase().includes(arg) ||
              t.id.toLowerCase().includes(arg),
          );
          if (matchedTripwire) {
            setSelectedNav('infrastructure');
            setInspectorTarget({ kind: 'tripwire', data: matchedTripwire });
            return { ok: true, message: `Found tripwire: ${matchedTripwire.id}` };
          }

          // Search ledger (live ECHO + mock)
          const allLedger = [...echoLedger, ...mockLedger];
          const matchedLedger = allLedger.find(
            (l) =>
              l.summary.toLowerCase().includes(arg) ||
              l.id.toLowerCase().includes(arg) ||
              l.type.includes(arg),
          );
          if (matchedLedger) {
            setSelectedNav('ledger');
            setInspectorTarget({ kind: 'ledger', data: matchedLedger });
            return { ok: true, message: `Found ledger entry: ${matchedLedger.id}` };
          }

          // Search sentinels
          const matchedSentinel = mockSentinels.find(
            (s) =>
              s.name.toLowerCase().includes(arg) ||
              s.role.toLowerCase().includes(arg),
          );
          if (matchedSentinel) {
            setSelectedNav('governance');
            setInspectorTarget({ kind: 'sentinel', data: matchedSentinel });
            return { ok: true, message: `Found sentinel: ${matchedSentinel.name}` };
          }

          // Search civic alerts (live ECHO + mock)
          const allAlerts = [...echoAlerts, ...mockCivicAlerts];
          const matchedAlert = allAlerts.find(
            (a) =>
              a.title.toLowerCase().includes(arg) ||
              a.category.includes(arg),
          );
          if (matchedAlert) {
            setSelectedNav('geopolitics');
            setInspectorTarget({ kind: 'alert', data: matchedAlert });
            return { ok: true, message: `Found alert: ${matchedAlert.id}` };
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
    [],
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

  // Merged data: live ECHO + mock
  const mergedLedger = [...echoLedger, ...mockLedger];
  const mergedAlerts = [...echoAlerts, ...mockCivicAlerts];

  // Chamber visibility rules
  const showEpicon = ['pulse', 'markets', 'geopolitics', 'governance', 'infrastructure', 'ledger'].includes(selectedNav);
  const showAgents = ['pulse', 'agents', 'reflections'].includes(selectedNav);
  const showMetrics = !['search', 'settings', 'ledger'].includes(selectedNav);
  const showLedger = ['ledger', 'pulse'].includes(selectedNav);
  const showSentinels = ['governance', 'pulse'].includes(selectedNav);
  const showRadar = ['geopolitics', 'infrastructure', 'pulse'].includes(selectedNav);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <TopStatusBar
        gi={gi.score}
        alertCount={tripwires.length + mergedAlerts.filter((a) => a.severity === 'critical' || a.severity === 'high').length}
        streamStatus={streamStatus}
        onNavigate={setSelectedNav}
        onShowGI={() => {
          setSelectedNav('governance');
          setInspectorTarget({ kind: 'gi', data: gi });
        }}
      />

      <div className="grid flex-1 grid-cols-12 max-md:grid-cols-1">
        <SidebarNav
          items={navItems}
          selected={selectedNav}
          onSelect={setSelectedNav}
        />

        <main className="col-span-7 max-lg:col-span-9 max-md:col-span-1 border-r border-slate-800 bg-slate-950">
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

            {showLedger && (
              <LedgerPanel
                entries={mergedLedger}
                selectedId={
                  inspectorTarget.kind === 'ledger'
                    ? inspectorTarget.data.id
                    : undefined
                }
                onSelect={(entry) =>
                  setInspectorTarget({ kind: 'ledger', data: entry })
                }
              />
            )}

            {showEpicon && selectedNav !== 'ledger' && (
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

            {showSentinels && (
              <SubstrateStatusCard
                sentinels={mockSentinels}
                selectedId={
                  inspectorTarget.kind === 'sentinel'
                    ? inspectorTarget.data.id
                    : undefined
                }
                onSelect={(sentinel) =>
                  setInspectorTarget({ kind: 'sentinel', data: sentinel })
                }
              />
            )}

            {showRadar && (
              <CivicRadarPanel
                alerts={mergedAlerts}
                selectedId={
                  inspectorTarget.kind === 'alert'
                    ? inspectorTarget.data.id
                    : undefined
                }
                onSelect={(alert) =>
                  setInspectorTarget({ kind: 'alert', data: alert })
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
        <span className="shrink-0">MOBIUS TERMINAL V1</span>
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
          <span className="hidden sm:inline">Substrate Connected · Browser Shell OK · Ledger Live · Sentinel Council Active</span>
          <span className="sm:hidden">All Systems OK</span>
        </div>
      </footer>
    </div>
  );
}
