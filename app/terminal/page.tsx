'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { TerminalCommandResult } from '@/lib/commands/types';
import TopStatusBar from '@/components/terminal/TopStatusBar';
import TerminalSection from '@/components/layout/TerminalSection';
import type { IntegrityTone } from '@/components/terminal/LiveIntegrityRibbon';
import AttestationReplayRail from '@/components/terminal/AttestationReplayRail';
import ConsensusPreviewStrip from '@/components/terminal/ConsensusPreviewStrip';
import SuggestedNextActions, { type SuggestedAction } from '@/components/terminal/SuggestedNextActions';
import TerminalShellFallback from '@/components/terminal/TerminalShellFallback';
import SidebarNav from '@/components/terminal/SidebarNav';
import EpiconFeedPanel from '@/components/terminal/EpiconFeedPanel';
import CandidateFeed from '@/components/epicon/CandidateFeed';
import AgentCortexPanel from '@/components/terminal/AgentCortexPanel';
import AgentGrid from '@/components/agents/AgentGrid';
import IntegrityMonitorCard from '@/components/terminal/IntegrityMonitorCard';
import PulseTimeline from '@/components/signals/PulseTimeline';
import TripwireWatchCard from '@/components/terminal/TripwireWatchCard';
import TripwirePanel from '@/components/tripwire/TripwirePanel';
import DetailInspectorRail from '@/components/terminal/DetailInspectorRail';
import MicAccountPanel from '@/components/mic/MicAccountPanel';
import type { ZeusVerifyPayload, ZeusVerifyResult } from '@/components/terminal/DetailInspectorRail';
import CommandPalette from '@/components/terminal/CommandPalette';
import CommandInput from '@/components/terminal/CommandInput';
import CommandResult from '@/components/terminal/CommandResult';
import QueryResultCard from '@/components/query/QueryResultCard';
import LedgerPanel from '@/components/terminal/LedgerPanel';
import SubstrateStatusCard from '@/components/terminal/SubstrateStatusCard';
import CivicRadarPanel from '@/components/terminal/CivicRadarPanel';
import SignalEnginePanel from '@/components/terminal/SignalEnginePanel';
import IntegrityRatingPanel from '@/components/terminal/IntegrityRatingPanel';
import { WalletProvider } from '@/contexts/WalletContext';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { navItems, mockCivicAlerts, mockSentinels } from '@/lib/terminal/mock';
import type { NavKey } from '@/lib/terminal/types';
import { mockQueryResult } from '@/lib/mock/queryResult';
import { cn } from '@/lib/terminal/utils';
import { useTerminalCommands } from '@/hooks/useTerminalCommands';
import { useTerminalData } from '@/hooks/useTerminalData';

const MICWalletPanel = dynamic(() => import('@/components/terminal/MICWalletPanel'));
const MFSShardPanel = dynamic(() => import('@/components/terminal/MFSShardPanel'));
const MICBlockchainExplorer = dynamic(() => import('@/components/terminal/MICBlockchainExplorer'));
const CreateEpiconModal = dynamic(() => import('@/components/terminal/CreateEpiconModal'));

const CHAMBER_DESCRIPTIONS: Partial<Record<NavKey, string>> = {
  search: 'Use the Command Palette below to search across all data. Try /scan followed by a keyword.',
  settings: 'Terminal configuration and operator preferences. Feature coming in V2.',
  wallet: 'MIC wallet, MFS shards, and blockchain explorer. Integrity economics in real time.',
  reflections: 'Agent reflection logs and cross-system annotations.',
};

function chamberStatus(nav: NavKey, gi: number, tripwireCount: number, epiconCount: number, alertCount: number) {
  if (CHAMBER_DESCRIPTIONS[nav]) return CHAMBER_DESCRIPTIONS[nav] as string;

  const giLabel = gi >= 0.85 ? 'GI stable' : gi >= 0.7 ? 'GI under pressure' : 'GI critical';
  const tripwireLabel = tripwireCount === 0 ? 'No active tripwires' : `${tripwireCount} tripwire${tripwireCount === 1 ? '' : 's'} active`;
  const feedLabel = `${epiconCount} signal${epiconCount === 1 ? '' : 's'} in feed`;

  switch (nav) {
    case 'pulse':
      return `${giLabel}. ${tripwireLabel}. ${feedLabel}. ${alertCount} alert${alertCount === 1 ? '' : 's'}.`;
    case 'geopolitics':
      return `Geopolitical signals filtered. ${feedLabel}. ${tripwireLabel}.`;
    case 'markets':
      return `Market signals filtered. ${feedLabel}.`;
    case 'governance':
      return `Governance view. ${giLabel}. Signal Engine scoring active.`;
    case 'infrastructure':
      return `Infrastructure watch. ${tripwireLabel}.`;
    case 'agents':
      return 'Canonical Mobius roster online. Visible agent presence restored.';
    default:
      return `${giLabel}. ${tripwireLabel}.`;
  }
}

const NAV_LABEL_MAP = new Map(navItems.map((item) => [item.key, item.label]));

export default function TerminalPageWrapper() {
  return (
    <WalletProvider>
      <TerminalPage />
    </WalletProvider>
  );
}

function TerminalPage() {
  const [selectedNav, setSelectedNav] = useState<NavKey>('pulse');
  const [commandResult, setCommandResult] = useState<TerminalCommandResult | null>(null);
  const {
    agents,
    allTripwires,
    dataRef,
    dominantTripwireState,
    echoAlerts,
    echoIntegrity,
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
    setShowCreateEpicon,
    showCreateEpicon,
    signalScores,
    streamStatus,
    submitEpiconDraft,
  } = useTerminalData(selectedNav);

  const handleCommand = useTerminalCommands({
    dataRef,
    setEchoAlerts,
    setEchoIntegrity,
    setEchoLedger,
    setEpicon,
    setInspectorTarget,
    setSelectedNav,
    setShowCreateEpicon,
  });

  if (!gi || !inspectorTarget) {
    return <TerminalShellFallback statusLabel="Booting Mobius Terminal · syncing integrity surfaces" />;
  }

  const mergedAlerts = [...echoAlerts, ...mockCivicAlerts];
  const showEpicon = ['pulse', 'markets', 'geopolitics', 'governance', 'infrastructure', 'ledger'].includes(selectedNav);
  const showAgents = ['pulse', 'agents', 'reflections'].includes(selectedNav);
  const showMetrics = !['search', 'settings', 'ledger', 'wallet'].includes(selectedNav);
  const showLedger = ['ledger', 'pulse'].includes(selectedNav);
  const showSentinels = ['governance', 'pulse'].includes(selectedNav);
  const showRadar = ['geopolitics', 'infrastructure', 'pulse'].includes(selectedNav);
  const showIntegrity = ['pulse', 'governance', 'agents'].includes(selectedNav);
  const showWallet = selectedNav === 'wallet';
  const showSignal = ['pulse', 'governance', 'geopolitics', 'markets'].includes(selectedNav);
  const showConsensus = showCreateEpicon || inspectorTarget.kind === 'epicon';
  const criticalAlertCount = mergedAlerts.filter((alert) => alert.severity === 'critical' || alert.severity === 'high').length;

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

    return [];
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

  const liveRibbonMii = integrityStatus?.mii_baseline ?? echoIntegrity?.avgMii ?? (mockSentinels.reduce((sum, sentinel) => sum + sentinel.integrity, 0) / mockSentinels.length);
  const liveRibbonMicDelta = echoIntegrity?.totalMicMinted ?? Math.max(0, gi.delta * 100);
  const cycleId = integrityStatus?.cycle ?? currentCycleId();
  const micSupply = integrityStatus?.mic_supply ?? 0;
  const terminalStatus = integrityStatus?.terminal_status ?? 'nominal';
  const primaryDriver = integrityStatus?.primary_driver ?? 'No primary driver available';
  const relatedLedgerEntry = inspectorTarget.kind === 'epicon'
    ? mergedLedger.find((entry) => entry.summary.includes(inspectorTarget.data.id) || entry.summary.toLowerCase().includes(inspectorTarget.data.title.toLowerCase().slice(0, 24)))
    : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <TopStatusBar
        alertCount={allTripwires.length + criticalAlertCount}
        mii={liveRibbonMii}
        micSupply={micSupply}
        terminalStatus={terminalStatus}
        primaryDriver={primaryDriver}
        cycleId={cycleId}
        streamStatus={streamStatus}
        onNavigate={setSelectedNav}
        gi={gi.score}
        micDelta={liveRibbonMicDelta}
        tripwireState={dominantTripwireState}
        lastLedgerSyncLabel={freshness.lastLedgerSyncLabel}
        lastIngestLabel={freshness.lastIngestLabel}
        lastCycleAdvanceLabel={freshness.lastCycleAdvanceLabel}
      />

      {showConsensus && (
        <ConsensusPreviewStrip
          title={showCreateEpicon ? 'Consensus Preview · Submission Lane' : 'Consensus Preview · Operator Lane'}
          subtitle={operatorMessage}
          agents={consensusAgents}
        />
      )}

      <div className="grid flex-1 grid-cols-12 max-md:grid-cols-1">
        <SidebarNav items={navItems} selected={selectedNav} onSelect={setSelectedNav} />

        <main className="col-span-7 border-r border-slate-800 bg-slate-950 max-lg:col-span-9 max-md:col-span-1 max-md:border-r-0">
          <div className="grid h-full auto-rows-max gap-4 p-4">
            <TerminalSection
              eyebrow="Command Surface"
              title={`${NAV_LABEL_MAP.get(selectedNav)} Chamber`}
              description={chamberStatus(selectedNav, gi.score, allTripwires.length, filteredEpicon.length, criticalAlertCount)}
              actions={
                <div className="space-y-1 text-right">
                  <div className="font-mono uppercase tracking-[0.15em] text-slate-500">{operatorMessage}</div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-slate-600">
                    {cycleId} · {terminalStatus} · {streamStatus === 'live' ? 'stream live' : streamStatus === 'reconnecting' ? 'reconnecting' : 'local mode'}
                  </div>
                </div>
              }
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1">Driver · {primaryDriver}</span>
                <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1">Signals · {filteredEpicon.length}</span>
                <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1">Tripwires · {allTripwires.length}</span>
                <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1">Alerts · {criticalAlertCount}</span>
              </div>
            </TerminalSection>

            {showLedger && (
              <LedgerPanel
                entries={mergedLedger}
                selectedId={inspectorTarget.kind === 'ledger' ? inspectorTarget.data.id : undefined}
                onSelect={(entry) => setInspectorTarget({ kind: 'ledger', data: entry })}
              />
            )}

            {showEpicon && selectedNav !== 'ledger' && (
              <TerminalSection
                eyebrow="Public Memory"
                title="EPICON Feed"
                description="Published signals, candidate intake, and current publication context."
                id="epicon"
              >
                <div className="space-y-4">
                  <EpiconFeedPanel
                    items={filteredEpicon}
                    selectedId={inspectorTarget.kind === 'epicon' ? inspectorTarget.data.id : ''}
                    onSelect={(item) => setInspectorTarget({ kind: 'epicon', data: item })}
                  />

                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="mb-3 text-xs uppercase tracking-[0.2em] text-amber-300">
                      External Candidate Feed
                    </div>
                    <CandidateFeed />
                  </div>
                </div>
              </TerminalSection>
            )}

            {showAgents && (
              <TerminalSection
                id="agents"
                eyebrow="Cortex"
                title={selectedNav === 'agents' ? 'Agent Grid' : 'Agent Cortex'}
                description="Canonical Mobius agents, roles, and status."
              >
                <div className="space-y-4">
                  {selectedNav === 'agents' && <AgentGrid />}
                  <AgentCortexPanel
                    agents={filteredAgents}
                    selectedId={inspectorTarget.kind === 'agent' ? inspectorTarget.data.id : undefined}
                    onSelect={(agent) => setInspectorTarget({ kind: 'agent', data: agent })}
                  />
                </div>
              </TerminalSection>
            )}

            {showSentinels && (
              <SubstrateStatusCard
                sentinels={mockSentinels}
                selectedId={inspectorTarget.kind === 'sentinel' ? inspectorTarget.data.id : undefined}
                onSelect={(sentinel) => setInspectorTarget({ kind: 'sentinel', data: sentinel })}
              />
            )}

            {showRadar && (
              <CivicRadarPanel
                alerts={mergedAlerts}
                selectedId={inspectorTarget.kind === 'alert' ? inspectorTarget.data.id : undefined}
                onSelect={(alert) => setInspectorTarget({ kind: 'alert', data: alert })}
              />
            )}

            {showSignal && signalScores.length > 0 && (
              <SignalEnginePanel
                scores={signalScores}
                selectedId={inspectorTarget.kind === 'signal' ? inspectorTarget.data.eventId : undefined}
                onSelect={(score) => setInspectorTarget({ kind: 'signal', data: score })}
              />
            )}

            {selectedNav === 'pulse' && (
              <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
                <TerminalSection
                  eyebrow="Live Intake"
                  title="Pulse Timeline"
                  description="Incoming micro-agent signals and current intake state."
                >
                  <PulseTimeline />
                </TerminalSection>

                <TerminalSection
                  eyebrow="System State"
                  title="Global Integrity"
                  description="Reactive integrity, tripwire, and system state."
                >
                  <div className="space-y-4">
                    <TripwirePanel />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <IntegrityMonitorCard gi={gi} onClick={() => setInspectorTarget({ kind: 'gi', data: gi })} />
                      <TripwireWatchCard
                        tripwires={allTripwires}
                        selectedId={inspectorTarget.kind === 'tripwire' ? inspectorTarget.data.id : undefined}
                        onSelect={(tripwire) => setInspectorTarget({ kind: 'tripwire', data: tripwire })}
                      />
                    </div>
                  </div>
                </TerminalSection>
              </div>
            )}

            {showIntegrity && <IntegrityRatingPanel integrity={echoIntegrity} />}

            {showWallet && (
              <>
                <MICWalletPanel gi={gi} integrity={echoIntegrity} />
                <MFSShardPanel integrity={echoIntegrity} />
                <MICBlockchainExplorer />
              </>
            )}

            {selectedNav === 'search' && (
              <TerminalSection
                eyebrow="Query"
                title="Query Result"
                description="Private save, follow-up, or publish to EPICON."
              >
                <QueryResultCard result={mockQueryResult} />
              </TerminalSection>
            )}

            {showMetrics && selectedNav !== 'pulse' && (
              <TerminalSection
                eyebrow="System State"
                title="Global Integrity"
                description="Reactive integrity posture, tripwire watch, and operator health context."
              >
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <IntegrityMonitorCard gi={gi} onClick={() => setInspectorTarget({ kind: 'gi', data: gi })} />
                  <TripwireWatchCard
                    tripwires={allTripwires}
                    selectedId={inspectorTarget.kind === 'tripwire' ? inspectorTarget.data.id : undefined}
                    onSelect={(tripwire) => setInspectorTarget({ kind: 'tripwire', data: tripwire })}
                  />
                </section>
              </TerminalSection>
            )}

            <TerminalSection
              eyebrow="Command Surface"
              title="Terminal Commands"
              description="Exact command matching for weekly digest, GI status, and agent status."
            >
              <div className="space-y-4">
                <CommandInput onResult={setCommandResult} />
                <CommandResult result={commandResult} />
              </div>
            </TerminalSection>

            <CommandPalette
              onExecute={(command) => {
                const result = handleCommand(command);
                setOperatorMessage(result.message);
                return result;
              }}
            />

            <SuggestedNextActions
              title={showCreateEpicon ? 'Suggested Next Actions · Submission Flow' : 'Suggested Next Actions'}
              actions={suggestedActions}
              onSelect={handleSuggestedAction}
            />
          </div>
        </main>

        <DetailInspectorRail
          target={inspectorTarget}
          prependContent={
            <>
              <TerminalSection
                id="mic"
                eyebrow="Account"
                title="MIC Account"
                description="Balance, stake, rewards, and burn state."
              >
                <MicAccountPanel />
              </TerminalSection>
              {inspectorTarget.kind === 'epicon' ? (
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
            </>
          }
          onZeusVerify={async (payload: ZeusVerifyPayload): Promise<ZeusVerifyResult> => {
            try {
              const response = await fetch('/api/zeus/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              const data = await response.json();
              if (data.ok) {
                setEpicon((prev) => prev.map((item) => (
                  item.id === payload.epiconId
                    ? { ...item, status: payload.finalStatus, confidenceTier: payload.finalConfidenceTier as 0 | 1 | 2 | 3 | 4 }
                    : item
                )));
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
          await submitEpiconDraft(draft);
        }}
      />

      <footer className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-4 py-2 text-xs font-mono text-slate-500">
        <span className="shrink-0">MOBIUS TERMINAL V1</span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
              streamStatus === 'live' ? 'bg-emerald-400' : streamStatus === 'reconnecting' ? 'bg-amber-400' : 'bg-slate-500',
            )}
          />
          <span className="hidden sm:inline">
            {cycleId} · {allTripwires.length} tripwire{allTripwires.length === 1 ? '' : 's'} · GI {gi.score.toFixed(2)} · MII {liveRibbonMii.toFixed(2)} · MIC {micSupply.toLocaleString()} · {filteredEpicon.length} signals · {streamStatus === 'live' ? 'Stream live' : streamStatus === 'reconnecting' ? 'Reconnecting' : 'Local mode'}
          </span>
          <span className="sm:hidden">{cycleId} · GI {gi.score.toFixed(2)}</span>
        </div>
      </footer>
    </div>
  );
}
