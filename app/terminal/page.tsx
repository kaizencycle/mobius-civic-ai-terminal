'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import TopStatusBar from '@/components/terminal/TopStatusBar';
import LiveIntegrityRibbon from '@/components/terminal/LiveIntegrityRibbon';
import AttestationReplayRail from '@/components/terminal/AttestationReplayRail';
import ConsensusPreviewStrip from '@/components/terminal/ConsensusPreviewStrip';
import SuggestedNextActions, { type SuggestedAction } from '@/components/terminal/SuggestedNextActions';
import TerminalShellFallback from '@/components/terminal/TerminalShellFallback';
import SidebarNav from '@/components/terminal/SidebarNav';
import EpiconFeedPanel from '@/components/terminal/EpiconFeedPanel';
import CandidateFeed from '@/components/epicon/CandidateFeed';
import AgentCortexPanel from '@/components/terminal/AgentCortexPanel';
import IntegrityMonitorCard from '@/components/terminal/IntegrityMonitorCard';
import TripwireWatchCard from '@/components/terminal/TripwireWatchCard';
import DetailInspectorRail from '@/components/terminal/DetailInspectorRail';
import type { ZeusVerifyPayload, ZeusVerifyResult } from '@/components/terminal/DetailInspectorRail';
import CommandPalette from '@/components/terminal/CommandPalette';
import LedgerPanel from '@/components/terminal/LedgerPanel';
import SubstrateStatusCard from '@/components/terminal/SubstrateStatusCard';
import CivicRadarPanel from '@/components/terminal/CivicRadarPanel';
import SignalEnginePanel from '@/components/terminal/SignalEnginePanel';
import { scoreBatch } from '@/lib/echo/signal-engine';
import { detectTripwires, mergeTripwires } from '@/lib/echo/tripwire-engine';
import IntegrityRatingPanel from '@/components/terminal/IntegrityRatingPanel';
import MICWalletPanel from '@/components/terminal/MICWalletPanel';
import MFSShardPanel from '@/components/terminal/MFSShardPanel';
import MICBlockchainExplorer from '@/components/terminal/MICBlockchainExplorer';
import CreateEpiconModal from '@/components/terminal/CreateEpiconModal';
import { useTerminalFreshness } from '@/hooks/useTerminalFreshness';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { WalletProvider, useWallet } from '@/contexts/WalletContext';
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
import type { CycleIntegritySummary } from '@/lib/echo/integrity-engine';
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
  wallet: undefined, // Wallet uses its own panels, not the chamber description
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
  '/signal': { nav: 'governance', label: 'Signal Engine' },
  '/wallet': { nav: 'wallet', label: 'Wallet' },
  '/mic': { nav: 'wallet', label: 'Wallet' },
  '/shards': { nav: 'wallet', label: 'Wallet' },
  '/blockchain': { nav: 'wallet', label: 'Wallet' },
};

const NAV_LABEL_MAP = new Map(navItems.map((n) => [n.key, n.label]));

// ── Component ────────────────────────────────────────────────

export default function TerminalPageWrapper() {
  return (
    <WalletProvider>
      <TerminalPage />
    </WalletProvider>
  );
}

function TerminalPage() {
  const [selectedNav, setSelectedNav] = useState<NavKey>('pulse');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [epicon, setEpicon] = useState<EpiconItem[]>([]);
  const [gi, setGi] = useState<GISnapshot | null>(null);
  const [tripwires, setTripwires] = useState<Tripwire[]>([]);
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>(isLiveAPI ? 'reconnecting' : 'offline');
  const [echoLedger, setEchoLedger] = useState<LedgerEntry[]>([]);
  const [echoAlerts, setEchoAlerts] = useState<CivicRadarAlert[]>([]);
  const [echoIntegrity, setEchoIntegrity] = useState<CycleIntegritySummary | null>(null);
  const [showCreateEpicon, setShowCreateEpicon] = useState(false);
  const [operatorMessage, setOperatorMessage] = useState('Terminal live. Awaiting operator action.');

  const mergedLedger = [...echoLedger, ...mockLedger];
  const { freshness } = useTerminalFreshness(mergedLedger);

  // MIC wallet — auto-mint when integrity engine produces MIC
  const { earnMIC } = useWallet();
  const lastMintedCycleRef = useRef<string | null>(null);

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
      if (feed.integrity) setEchoIntegrity(feed.integrity);
    }

    loadEcho();

    // Re-fetch ECHO data every 2 hours (feed route auto-re-ingests when stale)
    const interval = setInterval(loadEcho, 2 * 60 * 60 * 1000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Auto-mint MIC to local blockchain when integrity engine reports minted credits
  useEffect(() => {
    if (!echoIntegrity) return;
    if (echoIntegrity.totalMicMinted <= 0) return;
    if (lastMintedCycleRef.current === echoIntegrity.cycleId) return;

    lastMintedCycleRef.current = echoIntegrity.cycleId;
    earnMIC('echo_integrity_mint', echoIntegrity.totalMicMinted, {
      cycleId: echoIntegrity.cycleId,
      avgMii: echoIntegrity.avgMii,
      eventCount: echoIntegrity.eventCount,
      totalGiDelta: echoIntegrity.totalGiDelta,
    });
  }, [echoIntegrity, earnMIC]);

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
              'Commands: /submit, /profile [login], /scan [term], /agents, /tripwires, /gi, /signal, /ledger, /wallet, /mic, /shards, /blockchain, /sentinels, /radar, /echo, /clear',
          };

        case '/submit':
        case '/create':
          setShowCreateEpicon(true);
          return { ok: true, message: 'Opening EPICON submission modal...' };

        case '/profile': {
          const login = arg || 'kaizencycle';
          fetch(`/api/profile?login=${encodeURIComponent(login)}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.profile) {
                const p = data.profile;
                const accuracy = p.verificationHits + p.verificationMisses > 0
                  ? `${p.verificationHits}/${p.verificationHits + p.verificationMisses}`
                  : 'n/a';
                // Re-render with a fresh command result by updating a tripwire-style alert
                console.log(
                  `[PROFILE] ${p.login} | MII: ${p.miiScore} | Tier: ${p.nodeTier} | EPICONs: ${p.epiconCount} | Accuracy: ${accuracy}`,
                );
              }
            })
            .catch(() => { /* silent */ });
          return { ok: true, message: `Loading profile for ${login}...` };
        }

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
              if (feed.integrity) setEchoIntegrity(feed.integrity);
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
    return <TerminalShellFallback statusLabel="Booting Mobius Terminal · syncing integrity surfaces" />;
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
  const mergedAlerts = [...echoAlerts, ...mockCivicAlerts];

  // Signal Engine scoring
  const signalScores = scoreBatch(filteredEpicon);

  // Tripwire Detection Engine — auto-detect from current state
  const autoTripwires = gi ? detectTripwires({ epicon, gi, agents, tripwires }) : [];
  const allTripwires = mergeTripwires(tripwires, autoTripwires);

  // Chamber visibility rules
  const showEpicon = ['pulse', 'markets', 'geopolitics', 'governance', 'infrastructure', 'ledger'].includes(selectedNav);
  const showAgents = ['pulse', 'agents', 'reflections'].includes(selectedNav);
  const showMetrics = !['search', 'settings', 'ledger', 'wallet'].includes(selectedNav);
  const showLedger = ['ledger', 'pulse'].includes(selectedNav);
  const showSentinels = ['governance', 'pulse'].includes(selectedNav);
  const showRadar = ['geopolitics', 'infrastructure', 'pulse'].includes(selectedNav);
  const showIntegrity = ['pulse', 'governance', 'agents'].includes(selectedNav);
  const showWallet = selectedNav === 'wallet';
  const showSignal = ['pulse', 'governance', 'geopolitics', 'markets'].includes(selectedNav);

  const dominantTripwireState = allTripwires.some((tw) => tw.severity === 'high')
    ? 'degraded'
    : allTripwires.some((tw) => tw.severity === 'medium')
      ? 'watch'
      : 'stable';

  const consensusAgents = (() => {
    if (showCreateEpicon) {
      return [
        { name: 'ZEUS', verdict: 'approve' as const, note: 'Verification lane ready for operator-submitted signal.' },
        { name: 'EVE', verdict: 'caution' as const, note: 'Check ethics impact before publishing outward.' },
        { name: 'AUREA', verdict: 'approve' as const, note: 'Synthesis path available once evidence lands.' },
        { name: 'HERMES', verdict: 'approve' as const, note: 'Routing prepared for intake and escalation.' },
        { name: 'JADE', verdict: 'pending' as const, note: 'Annotation layer opens after submission.' },
        { name: 'ATLAS', verdict: 'caution' as const, note: 'Tripwire scan will run on submit.' },
      ];
    }

    if (inspectorTarget.kind === 'epicon') {
      const event = inspectorTarget.data;
      return [
        { name: 'ZEUS', verdict: event.status === 'contradicted' ? 'block' as const : 'approve' as const, note: `Confidence tier ${event.confidenceTier} attestation ready.` },
        { name: 'EVE', verdict: event.status === 'pending' ? 'caution' as const : 'approve' as const, note: 'Public impact review remains visible.' },
        { name: 'AUREA', verdict: 'approve' as const, note: 'Strategic synthesis can be generated from current trace.' },
        { name: 'HERMES', verdict: 'approve' as const, note: 'Routing path mapped from intake to chamber context.' },
        { name: 'JADE', verdict: 'pending' as const, note: 'Human annotation slot available for operator notes.' },
        { name: 'ATLAS', verdict: dominantTripwireState === 'degraded' ? 'caution' as const : 'approve' as const, note: 'Anomaly posture matches current tripwire state.' },
      ];
    }

    return [
      { name: 'ZEUS', verdict: 'approve' as const, note: 'Verification fabric nominal.' },
      { name: 'EVE', verdict: 'approve' as const, note: 'Ethics observer online.' },
      { name: 'AUREA', verdict: 'approve' as const, note: 'Synthesis layer stable.' },
      { name: 'HERMES', verdict: streamStatus === 'offline' ? 'caution' as const : 'approve' as const, note: 'Routing follows stream posture.' },
      { name: 'JADE', verdict: 'pending' as const, note: 'Annotation opens when operator context is supplied.' },
      { name: 'ATLAS', verdict: dominantTripwireState === 'degraded' ? 'caution' as const : 'approve' as const, note: 'Risk preview mirrors active tripwires.' },
    ];
  })();

  const suggestedActions: SuggestedAction[] = (() => {
    if (showCreateEpicon) {
      return [
        { id: 'submit.epicon', label: 'Complete EPICON draft', description: 'Attach sources, confidence, and tags before sending to ECHO.' },
        { id: 'request.consensus', label: 'Request consensus', description: 'Preview ZEUS/EVE/AUREA review before operator submission.' },
        { id: 'open.tripwire', label: 'Inspect tripwire posture', description: 'Check whether this signal should enter a watch lane first.' },
      ];
    }

    if (inspectorTarget.kind === 'epicon') {
      return [
        { id: 'ledger.open', label: 'Open ledger record', description: 'Jump to the correlated ledger write for this EPICON.' },
        { id: 'consensus.request', label: 'Request consensus', description: 'Preview cross-agent verdicts before escalating or publishing.' },
        { id: 'tripwire.escalate', label: 'Escalate to tripwire', description: 'Promote the event into infrastructure watch if risk increases.' },
        { id: 'annotate.jade', label: 'Annotate with JADE', description: 'Capture human context and morale signals in the trace.' },
        { id: 'inspect.wallet', label: 'Open wallet impact', description: 'Review MIC / MII implications from integrity movement.' },
      ];
    }

    return [
      { id: 'scan.epicon', label: 'Scan related EPICONs', description: 'Search the active feed for adjacent events or categories.' },
      { id: 'open.ledger', label: 'Open ledger chamber', description: 'Review the immutable record for the current cycle.' },
      { id: 'open.wallet', label: 'Inspect wallet impact', description: 'Check MIC minting and MFS shard activity.' },
    ];
  })();

  const handleSuggestedAction = (actionId: string) => {
    setOperatorMessage(`Operator action queued: ${actionId}`);

    if (actionId === 'open.ledger' || actionId === 'ledger.open') {
      setSelectedNav('ledger');
      const latest = mergedLedger[0];
      if (latest) setInspectorTarget({ kind: 'ledger', data: latest });
      return;
    }

    if (actionId === 'tripwire.escalate' || actionId === 'open.tripwire') {
      setSelectedNav('infrastructure');
      const active = allTripwires[0];
      if (active) setInspectorTarget({ kind: 'tripwire', data: active });
      return;
    }

    if (actionId === 'inspect.wallet' || actionId === 'open.wallet') {
      setSelectedNav('wallet');
      return;
    }

    if (actionId === 'annotate.jade') {
      setSelectedNav('reflections');
      const jade = agents.find((agent) => agent.id === 'jade');
      if (jade) setInspectorTarget({ kind: 'agent', data: jade });
      return;
    }

    if (actionId === 'scan.epicon') {
      setSelectedNav('search');
      return;
    }

    if (actionId === 'submit.epicon') {
      setShowCreateEpicon(true);
      return;
    }

    if (actionId === 'request.consensus' || actionId === 'consensus.request') {
      setOperatorMessage('Consensus request staged across ZEUS, EVE, AUREA, HERMES, JADE, and ATLAS.');
    }
  };

  const liveRibbonMii = echoIntegrity?.avgMii ?? (mockSentinels.reduce((sum, sentinel) => sum + sentinel.integrity, 0) / mockSentinels.length);
  const liveRibbonMicDelta = echoIntegrity?.totalMicMinted ?? Math.max(0, gi.delta * 100);
  const relatedLedgerEntry = inspectorTarget.kind === 'epicon'
    ? mergedLedger.find((entry) => entry.summary.includes(inspectorTarget.data.id) || entry.summary.toLowerCase().includes(inspectorTarget.data.title.toLowerCase().slice(0, 24)))
    : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <TopStatusBar
        gi={gi.score}
        alertCount={allTripwires.length + mergedAlerts.filter((a) => a.severity === 'critical' || a.severity === 'high').length}
        cycleId={currentCycleId()}
        streamStatus={streamStatus}
        onNavigate={setSelectedNav}
        onShowGI={() => {
          setSelectedNav('governance');
          setInspectorTarget({ kind: 'gi', data: gi });
        }}
      />

      <LiveIntegrityRibbon
        gi={gi.score}
        mii={liveRibbonMii}
        micDelta={liveRibbonMicDelta}
        tripwireState={dominantTripwireState}
        lastLedgerSyncLabel={freshness.lastLedgerSyncLabel}
        lastIngestLabel={freshness.lastIngestLabel}
        lastCycleAdvanceLabel={freshness.lastCycleAdvanceLabel}
        cycleId={currentCycleId()}
        streamLabel={streamStatus === 'live' ? 'LIVE' : streamStatus === 'reconnecting' ? 'RECONNECTING' : 'OFFLINE'}
      />

      <ConsensusPreviewStrip
        title={showCreateEpicon ? 'Consensus Preview · Submission Lane' : 'Consensus Preview · Operator Lane'}
        subtitle={operatorMessage}
        agents={consensusAgents}
      />

      <div className="grid flex-1 grid-cols-12 max-md:grid-cols-1">
        <SidebarNav
          items={navItems}
          selected={selectedNav}
          onSelect={setSelectedNav}
        />

        <main className="col-span-7 max-lg:col-span-9 max-md:col-span-1 border-r border-slate-800 max-md:border-r-0 bg-slate-950">
          <div className="grid h-full grid-rows-[auto_auto_auto_1fr] gap-4 p-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-mono uppercase tracking-[0.2em] text-sky-300">
                    {NAV_LABEL_MAP.get(selectedNav)} Chamber
                  </div>
                  <div className="mt-2 text-sm font-sans text-slate-400">
                    {CHAMBER_DESCRIPTIONS[selectedNav] ?? 'Operational state is visible before command entry. Use the live ribbon, replay rail, and consensus strip to inspect trust, freshness, and next actions from first paint.'}
                  </div>
                </div>
                <div className="max-w-md text-xs font-mono uppercase tracking-[0.15em] text-slate-500">
                  {operatorMessage}
                </div>
              </div>
            </div>

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
              <>
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

                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="mb-3 text-xs font-mono uppercase tracking-[0.2em] text-amber-300">
                    External Candidate Feed
                  </div>
                  <CandidateFeed />
                </div>
              </>
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

            {showSignal && signalScores.length > 0 && (
              <SignalEnginePanel
                scores={signalScores}
                selectedId={
                  inspectorTarget.kind === 'signal'
                    ? inspectorTarget.data.eventId
                    : undefined
                }
                onSelect={(score) =>
                  setInspectorTarget({ kind: 'signal', data: score })
                }
              />
            )}

            {showIntegrity && (
              <IntegrityRatingPanel integrity={echoIntegrity} />
            )}

            {showWallet && (
              <>
                <MICWalletPanel gi={gi} integrity={echoIntegrity} />
                <MFSShardPanel integrity={echoIntegrity} />
                <MICBlockchainExplorer />
              </>
            )}

            {showMetrics && (
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <IntegrityMonitorCard
                  gi={gi}
                  onClick={() =>
                    setInspectorTarget({ kind: 'gi', data: gi })
                  }
                />
                <TripwireWatchCard
                  tripwires={allTripwires}
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

            <CommandPalette onExecute={(command) => { const result = handleCommand(command); setOperatorMessage(result.message); return result; }} />

            <SuggestedNextActions
              title={showCreateEpicon ? 'Suggested Next Actions · Submission Flow' : 'Suggested Next Actions'}
              actions={suggestedActions}
              onSelect={handleSuggestedAction}
            />
          </div>
        </main>

        <DetailInspectorRail
          target={inspectorTarget}
          prependContent={inspectorTarget.kind === 'epicon' ? (
            <AttestationReplayRail
              event={inspectorTarget.data}
              relatedLedger={relatedLedgerEntry}
              onAction={(actionId) => {
                setOperatorMessage(`Replay rail action queued: ${actionId}`);
                if (actionId === 'compare') {
                  setSelectedNav('governance');
                }
              }}
            />
          ) : null}
          onZeusVerify={async (payload: ZeusVerifyPayload): Promise<ZeusVerifyResult> => {
            try {
              const res = await fetch('/api/zeus/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              const data = await res.json();
              if (data.ok) {
                // Update the EPICON in the feed to reflect verification
                setEpicon((prev) =>
                  prev.map((e) =>
                    e.id === payload.epiconId
                      ? { ...e, status: payload.finalStatus, confidenceTier: payload.finalConfidenceTier as 0 | 1 | 2 | 3 | 4 }
                      : e,
                  ),
                );
              }
              return {
                ok: data.ok,
                miiScore: data.profile?.miiScore,
                nodeTier: data.profile?.nodeTier,
              };
            } catch {
              return { ok: false };
            }
          }}
        />
      </div>

      <CreateEpiconModal
        open={showCreateEpicon}
        onClose={() => {
          setShowCreateEpicon(false);
          setOperatorMessage('EPICON submission lane closed. Terminal returned to live monitoring.');
        }}
        onSubmit={async (draft) => {
          const sources = [draft.source1, draft.source2, draft.source3]
            .map((s) => s.trim())
            .filter(Boolean);
          const tags = draft.tags.split(',').map((t) => t.trim()).filter(Boolean);
          const confidenceMap: Record<string, number> = { low: 1, medium: 2, high: 3 };

          const res = await fetch('/api/epicon/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: draft.title,
              summary: draft.summary,
              category: draft.category,
              sources,
              tags,
              confidenceTier: confidenceMap[draft.confidence] ?? 1,
            }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || 'Submission failed');

          // Optimistic UI — add to feed immediately
          setOperatorMessage(`EPICON ${data.epicon.id} staged for ZEUS verification.`);

          setEpicon((prev) => [{
            id: data.epicon.id,
            title: data.epicon.title,
            summary: data.epicon.summary,
            category: data.epicon.category,
            status: 'pending' as const,
            confidenceTier: data.epicon.confidenceTier as 0 | 1 | 2 | 3 | 4,
            ownerAgent: 'ECHO',
            sources: data.epicon.sources,
            timestamp: data.epicon.timestamp,
            trace: data.epicon.trace,
          }, ...prev].slice(0, 30));
        }}
      />

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
