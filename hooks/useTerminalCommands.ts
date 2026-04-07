'use client';

import { useCallback } from 'react';
import { getEchoFeed } from '@/lib/terminal/api';
import { mockCivicAlerts, mockLedger, mockSentinels } from '@/lib/terminal/mock';
import type { CycleIntegritySummary } from '@/lib/echo/integrity-engine';
import type {
  Agent,
  CivicRadarAlert,
  CommandResult,
  EpiconItem,
  GISnapshot,
  InspectorTarget,
  LedgerEntry,
  NavKey,
  Tripwire,
} from '@/lib/terminal/types';

const NAV_COMMANDS: Record<string, { nav: NavKey; label: string }> = {
  '/globe': { nav: 'globe', label: 'Globe' },
  '/pulse': { nav: 'pulse', label: 'Pulse' },
  '/sentinel': { nav: 'agents', label: 'Sentinel' },
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
  '/signal': { nav: 'governance', label: 'Signal Engine' },
  '/wallet': { nav: 'wallet', label: 'Wallet' },
  '/mic': { nav: 'wallet', label: 'Wallet' },
  '/shards': { nav: 'wallet', label: 'Wallet' },
  '/blockchain': { nav: 'wallet', label: 'Wallet' },
};

type CommandDataSnapshot = {
  agents: Agent[];
  echoAlerts: CivicRadarAlert[];
  echoLedger: LedgerEntry[];
  epicon: EpiconItem[];
  gi: GISnapshot | null;
  tripwires: Tripwire[];
};

type UseTerminalCommandsArgs = {
  dataRef: React.MutableRefObject<CommandDataSnapshot>;
  setEchoAlerts: React.Dispatch<React.SetStateAction<CivicRadarAlert[]>>;
  setEchoIntegrity: React.Dispatch<React.SetStateAction<CycleIntegritySummary | null>>;
  setEchoLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  setEpicon: React.Dispatch<React.SetStateAction<EpiconItem[]>>;
  setInspectorTarget: React.Dispatch<React.SetStateAction<InspectorTarget | null>>;
  setSelectedNav: React.Dispatch<React.SetStateAction<NavKey>>;
  setShowCreateEpicon: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useTerminalCommands({
  dataRef,
  setEchoAlerts,
  setEchoIntegrity,
  setEchoLedger,
  setEpicon,
  setInspectorTarget,
  setSelectedNav,
  setShowCreateEpicon,
}: UseTerminalCommandsArgs) {
  return useCallback((input: string): CommandResult => {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const arg = parts.slice(1).join(' ').toLowerCase();
    const { agents, echoAlerts, echoLedger, epicon, gi, tripwires } = dataRef.current;

    if (cmd && cmd in NAV_COMMANDS) {
      const { label, nav } = NAV_COMMANDS[cmd];
      setSelectedNav(nav);
      return { ok: true, message: `Switched to ${label} view` };
    }

    switch (cmd) {
      case '/help':
        return {
          ok: true,
          message:
            'Commands: /submit, /profile [login], /scan [term], /agents, /tripwires, /gi, /signal, /ledger, /wallet, /mic, /shards, /blockchain, /sentinels, /radar, /echo, /clear',
        };

      case '/submit':
      case '/create':
        setShowCreateEpicon(true);
        return { ok: true, message: 'Opening EPICON submission modal...' };

      case '/profile': {
        const login = arg || 'kaizencycle';
        fetch(`/api/profile?login=${encodeURIComponent(login)}`)
          .then((response) => response.json())
          .then((data) => {
            if (data.profile) {
              const profile = data.profile;
              const accuracy = profile.verificationHits + profile.verificationMisses > 0
                ? `${profile.verificationHits}/${profile.verificationHits + profile.verificationMisses}`
                : 'n/a';
              console.log(
                `[PROFILE] ${profile.login} | MII: ${profile.miiScore} | Tier: ${profile.nodeTier} | EPICONs: ${profile.epiconCount} | Accuracy: ${accuracy}`,
              );
            }
          })
          .catch(() => undefined);
        return { ok: true, message: `Loading profile for ${login}...` };
      }

      case '/echo': {
        fetch('/api/echo/ingest', { method: 'POST' })
          .then((response) => response.json())
          .then(() => getEchoFeed())
          .then((feed) => {
            if (!feed) return;
            if (feed.epicon.length > 0) {
              setEpicon((prev) => {
                const liveIds = new Set(feed.epicon.map((item) => item.id));
                return [...feed.epicon, ...prev.filter((item) => !liveIds.has(item.id))].slice(0, 30);
              });
            }
            setEchoLedger(feed.ledger);
            setEchoAlerts(feed.alerts);
            if (feed.integrity) setEchoIntegrity(feed.integrity);
          })
          .catch(() => undefined);
        return { ok: true, message: 'ECHO ingest triggered. Live data will refresh shortly.' };
      }

      case '/agents':
        setSelectedNav('agents');
        if (arg) {
          const found = agents.find((agent) => agent.name.toLowerCase() === arg || agent.id.toLowerCase() === arg);
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
          const found = tripwires.find((tripwire) => tripwire.id.toLowerCase() === arg || tripwire.label.toLowerCase().includes(arg));
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
        return { ok: true, message: gi ? `GI score: ${gi.score.toFixed(2)}` : 'Loading...' };

      case '/sentinels':
      case '/sentinel':
        setSelectedNav('governance');
        if (arg) {
          const found = mockSentinels.find((sentinel) => sentinel.name.toLowerCase() === arg || sentinel.id.toLowerCase() === arg);
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

        const matchedEpicon = epicon.find((item) => item.title.toLowerCase().includes(arg) || item.summary.toLowerCase().includes(arg) || item.category.toLowerCase().includes(arg));
        if (matchedEpicon) {
          setInspectorTarget({ kind: 'epicon', data: matchedEpicon });
          return { ok: true, message: `Found: ${matchedEpicon.id} — ${matchedEpicon.title}` };
        }

        const matchedAgent = agents.find((agent) => agent.name.toLowerCase().includes(arg) || agent.role.toLowerCase().includes(arg));
        if (matchedAgent) {
          setSelectedNav('agents');
          setInspectorTarget({ kind: 'agent', data: matchedAgent });
          return { ok: true, message: `Found agent: ${matchedAgent.name}` };
        }

        const matchedTripwire = tripwires.find((tripwire) => tripwire.label.toLowerCase().includes(arg) || tripwire.id.toLowerCase().includes(arg));
        if (matchedTripwire) {
          setSelectedNav('infrastructure');
          setInspectorTarget({ kind: 'tripwire', data: matchedTripwire });
          return { ok: true, message: `Found tripwire: ${matchedTripwire.id}` };
        }

        const allLedger = [...echoLedger, ...mockLedger];
        const matchedLedger = allLedger.find((entry) => entry.summary.toLowerCase().includes(arg) || entry.id.toLowerCase().includes(arg) || entry.type.includes(arg));
        if (matchedLedger) {
          setSelectedNav('ledger');
          setInspectorTarget({ kind: 'ledger', data: matchedLedger });
          return { ok: true, message: `Found ledger entry: ${matchedLedger.id}` };
        }

        const matchedSentinel = mockSentinels.find((sentinel) => sentinel.name.toLowerCase().includes(arg) || sentinel.role.toLowerCase().includes(arg));
        if (matchedSentinel) {
          setSelectedNav('governance');
          setInspectorTarget({ kind: 'sentinel', data: matchedSentinel });
          return { ok: true, message: `Found sentinel: ${matchedSentinel.name}` };
        }

        const allAlerts = [...echoAlerts, ...mockCivicAlerts];
        const matchedAlert = allAlerts.find((alert) => alert.title.toLowerCase().includes(arg) || alert.category.includes(arg));
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
        return { ok: false, message: `Unknown command "${cmd}". Type /help for options.` };
    }
  }, [dataRef, setEchoAlerts, setEchoIntegrity, setEchoLedger, setEpicon, setInspectorTarget, setSelectedNav, setShowCreateEpicon]);
}
