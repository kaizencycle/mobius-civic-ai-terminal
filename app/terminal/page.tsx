'use client';

import { useEffect, useState } from 'react';
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
  NavKey,
  Tripwire,
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
  const [selectedEvent, setSelectedEvent] = useState<EpiconItem | null>(null);
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
      setSelectedEvent((prev) => prev ?? epiconData[0] ?? null);
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
      if (msg.type === 'agents' && 'agents' in msg) {
        setAgents(msg.agents as Agent[]);
      }

      if (msg.type === 'epicon' && 'item' in msg) {
        const item = msg.item as EpiconItem;
        setEpicon((prev) =>
          [item, ...prev.filter((p) => p.id !== item.id)].slice(0, 20),
        );
        setSelectedEvent((prev) => prev ?? item);
      }

      if (msg.type === 'integrity' && 'gi' in msg) {
        setGi(msg.gi as GISnapshot);
      }

      if (msg.type === 'tripwire' && 'tripwires' in msg) {
        setTripwires(msg.tripwires as Tripwire[]);
      }
    });

    return () => {
      source?.close();
    };
  }, []);

  if (!gi || !selectedEvent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300 font-mono">
        Loading Mobius Terminal...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen flex-col">
        <TopStatusBar
          clock={clock}
          gi={gi.score}
          alertCount={tripwires.length}
        />

        <div className="grid flex-1 grid-cols-12">
          <SidebarNav
            items={navItems}
            selected={selectedNav}
            onSelect={setSelectedNav}
          />

          <main className="col-span-7 border-r border-slate-800 bg-slate-950">
            <div className="grid h-full grid-rows-[auto_auto_auto_1fr] gap-4 p-4">
              <EpiconFeedPanel
                items={epicon}
                selectedId={selectedEvent.id}
                onSelect={setSelectedEvent}
              />

              <AgentCortexPanel agents={agents} />

              <section className="grid grid-cols-2 gap-4">
                <IntegrityMonitorCard gi={gi} />
                <TripwireWatchCard tripwires={tripwires} />
              </section>

              <CommandPalette value={command} onChange={setCommand} />
            </div>
          </main>

          <DetailInspectorRail event={selectedEvent} />
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
