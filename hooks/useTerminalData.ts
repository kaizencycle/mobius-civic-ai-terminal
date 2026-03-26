'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { scoreBatch } from '@/lib/echo/signal-engine';
import { detectTripwires, mergeTripwires } from '@/lib/echo/tripwire-engine';
import type { CycleIntegritySummary } from '@/lib/echo/integrity-engine';
import { useTerminalFreshness } from '@/hooks/useTerminalFreshness';
import { useWallet } from '@/contexts/WalletContext';
import {
  getAgents,
  getEchoFeed,
  getEpiconFeed,
  getIntegrityStatus,
  getLedgerBackfill,
  getTripwires,
  integrityStatusToGISnapshot,
  isLiveAPI,
} from '@/lib/terminal/api';
import { mockLedger } from '@/lib/terminal/mock';
import type { IntegrityStatusResponse } from '@/lib/mock/integrityStatus';
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
import {
  connectMobiusStream,
  type StreamConnectionStatus,
  type StreamMessage,
} from '@/lib/terminal/stream';
import type { StreamStatus } from '@/components/terminal/TopStatusBar';

const CATEGORY_MAP: Partial<Record<NavKey, EpiconItem['category']>> = {
  markets: 'market',
  geopolitics: 'geopolitical',
  governance: 'governance',
  infrastructure: 'infrastructure',
};

type SubmitDraft = {
  title: string;
  summary: string;
  category: 'geopolitical' | 'market' | 'governance' | 'infrastructure';
  confidence: 'low' | 'medium' | 'high';
  source1: string;
  source2: string;
  source3: string;
  tags: string;
};

export function useTerminalData(selectedNav: NavKey) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [epicon, setEpicon] = useState<EpiconItem[]>([]);
  const [gi, setGi] = useState<GISnapshot | null>(null);
  const [tripwires, setTripwires] = useState<Tripwire[]>([]);
  const [integrityStatus, setIntegrityStatus] = useState<IntegrityStatusResponse | null>(null);
  const [backfillLedger, setBackfillLedger] = useState<LedgerEntry[]>([]);
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>(isLiveAPI ? 'reconnecting' : 'offline');
  const [echoLedger, setEchoLedger] = useState<LedgerEntry[]>([]);
  const [echoAlerts, setEchoAlerts] = useState<CivicRadarAlert[]>([]);
  const [echoIntegrity, setEchoIntegrity] = useState<CycleIntegritySummary | null>(null);
  const [showCreateEpicon, setShowCreateEpicon] = useState(false);
  const [operatorMessage, setOperatorMessage] = useState('Terminal live. Awaiting operator action.');

  const mergedLedger = useMemo(() => [...echoLedger, ...backfillLedger, ...mockLedger], [backfillLedger, echoLedger]);
  const { freshness } = useTerminalFreshness(mergedLedger);

  const { earnMIC } = useWallet();
  const lastMintedCycleRef = useRef<string | null>(null);

  const dataRef = useRef({ agents, epicon, gi, tripwires, echoLedger, echoAlerts, integrityStatus, backfillLedger });
  dataRef.current = { agents, epicon, gi, tripwires, echoLedger, echoAlerts, integrityStatus, backfillLedger };

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [agentsData, epiconData, integrityData, tripwireData, ledgerBackfillData] = await Promise.all([
        getAgents(),
        getEpiconFeed(),
        getIntegrityStatus(),
        getTripwires(),
        getLedgerBackfill(),
      ]);

      if (!mounted) return;
      setAgents(agentsData);
      setEpicon(epiconData);
      setIntegrityStatus(integrityData);
      setGi((prev) => integrityStatusToGISnapshot(integrityData, prev?.score));
      setTripwires(tripwireData);
      setBackfillLedger(ledgerBackfillData);
      setInspectorTarget((prev) => prev ?? (epiconData[0] ? { kind: 'epicon', data: epiconData[0] } : null));
    }

    load();

    if (isLiveAPI) {
      const interval = window.setInterval(load, 15000);
      return () => {
        mounted = false;
        window.clearInterval(interval);
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const source = connectMobiusStream(
      (msg: StreamMessage) => {
        if (msg.type === 'agents') setAgents(msg.agents);
        if (msg.type === 'epicon') {
          setEpicon((prev) => [msg.item, ...prev.filter((item) => item.id !== msg.item.id)].slice(0, 20));
          setInspectorTarget((prev) => prev ?? { kind: 'epicon', data: msg.item });
        }
        if (msg.type === 'integrity') setGi(msg.gi);
        if (msg.type === 'tripwire') setTripwires(msg.tripwires);
      },
      (status: StreamConnectionStatus) => setStreamStatus(status),
    );

    return () => {
      source?.close();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadEcho() {
      const feed = await getEchoFeed();
      if (!mounted || !feed) return;

      if (feed.epicon.length > 0) {
        setEpicon((prev) => {
          const liveIds = new Set(feed.epicon.map((item) => item.id));
          return [...feed.epicon, ...prev.filter((item) => !liveIds.has(item.id))].slice(0, 30);
        });
      }

      setEchoLedger(feed.ledger);
      setEchoAlerts(feed.alerts);
      if (feed.integrity) setEchoIntegrity(feed.integrity);
    }

    loadEcho();
    const interval = window.setInterval(loadEcho, 2 * 60 * 60 * 1000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

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

  const filteredEpicon = useMemo(
    () => (CATEGORY_MAP[selectedNav] ? epicon.filter((item) => item.category === CATEGORY_MAP[selectedNav]) : epicon),
    [epicon, selectedNav],
  );

  const filteredAgents = useMemo(
    () => (selectedNav === 'pulse' || selectedNav === 'agents' ? agents : agents.filter((agent) => agent.status !== 'idle')),
    [agents, selectedNav],
  );

  const signalScores = useMemo(() => scoreBatch(filteredEpicon), [filteredEpicon]);

  const allTripwires = useMemo(() => {
    if (!gi) return mergeTripwires(tripwires, []);
    const autoTripwires = detectTripwires({ epicon, gi, agents, tripwires });
    return mergeTripwires(tripwires, autoTripwires);
  }, [agents, epicon, gi, tripwires]);

  const dominantTripwireState = useMemo(() => {
    if (allTripwires.some((tripwire) => tripwire.severity === 'high')) return 'degraded' as const;
    if (allTripwires.some((tripwire) => tripwire.severity === 'medium')) return 'watch' as const;
    return 'stable' as const;
  }, [allTripwires]);

  const submitEpiconDraft = async (draft: SubmitDraft): Promise<CommandResult> => {
    const sources = [draft.source1, draft.source2, draft.source3].map((source) => source.trim()).filter(Boolean);
    const tags = draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    const confidenceMap: Record<string, number> = { low: 1, medium: 2, high: 3 };

    const res = await fetch('/api/epicon/submit', {
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

    return { ok: true, message: `EPICON ${data.epicon.id} submitted.` };
  };

  return {
    agents,
    dataRef,
    dominantTripwireState,
    echoAlerts,
    echoIntegrity,
    echoLedger,
    epicon,
    filteredAgents,
    filteredEpicon,
    freshness,
    gi,
    integrityStatus,
    inspectorTarget,
    mergedLedger,
    operatorMessage,
    setEchoAlerts,
    setEchoIntegrity,
    setEchoLedger,
    setEpicon,
    setInspectorTarget,
    setOperatorMessage,
    setSelectedInspectorTarget: setInspectorTarget,
    setShowCreateEpicon,
    setStreamStatus,
    setTripwires,
    showCreateEpicon,
    signalScores,
    streamStatus,
    submitEpiconDraft,
    tripwires,
    allTripwires,
  };
}
