'use client';

import { useState } from 'react';
import type { InspectorTarget, Tripwire } from '@/lib/terminal/types';
import { confidenceLabel, statusColor, tripwireStyle, giScoreColor, metricBarColor, cn } from '@/lib/terminal/utils';
import SectionLabel from './SectionLabel';

export type ZeusVerifyPayload = {
  epiconId: string;
  outcome: 'hit' | 'miss';
  finalStatus: 'verified' | 'contradicted';
  finalConfidenceTier: number;
  zeusNote: string;
};

export type ZeusVerifyResult = {
  ok: boolean;
  miiScore?: number;
  nodeTier?: string;
};

// ── Shared sub-components ────────────────────────────────────

function SmallLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-mono font-medium uppercase tracking-[0.18em] text-slate-500">
      {children}
    </div>
  );
}

function InspectorStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-sans font-medium text-slate-200">
        {value}
      </div>
    </div>
  );
}

function NumberedStepList({ items }: { items: string[] }) {
  return (
    <div className="mt-2 space-y-2">
      {items.map((item, i) => (
        <div
          key={i}
          className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-sans text-slate-300"
        >
          <span className="mr-2 font-mono text-slate-500">
            {String(i + 1).padStart(2, '0')}
          </span>
          {item}
        </div>
      ))}
    </div>
  );
}

// ── Static data (hoisted to module scope) ────────────────────

const SUBTITLES: Record<InspectorTarget['kind'], string> = {
  epicon: 'Why Mobius believes this',
  agent: 'Agent operational profile',
  tripwire: 'Alert analysis and protocol',
  gi: 'Integrity metrics deep dive',
  ledger: 'Immutable record provenance',
  shard: 'Fractal shard analysis',
  alert: 'Civic threat assessment',
  sentinel: 'Sentinel operational profile',
  signal: 'Signal vs narrative divergence analysis',
};

const AGENT_CAPABILITIES: Record<string, string[]> = {
  atlas: ['Substrate integrity scanning', 'Downstream amplification control', 'System integrity context updates'],
  zeus: ['Multi-source cross-verification', 'Source chain validation', 'Confidence tier assessment'],
  hermes: ['Signal routing and flow control', 'Geopolitical signal prioritization', 'Propagation throttling'],
  echo: ['Ledger intake and memory recording', 'EPICON snapshot archival', 'Design record preservation'],
  aurea: ['Strategic synthesis drafting', 'Civic layout architecture', 'Cross-domain pattern analysis'],
  jade: ['Morale annotation tracking', 'Reflection input processing', 'Team sentiment analysis'],
  eve: ['Cross-agent output observation', 'Ethical compliance monitoring', 'Bias detection scanning'],
  daedalus: ['Terminal module compilation', 'Research note assembly', 'Implementation prototyping'],
};

const DEFAULT_CAPABILITIES = ['General operations', 'Standard monitoring'];

const PROTOCOL_HIGH = [
  'Immediate operator notification dispatched',
  'Downstream propagation halted',
  'Primary source confirmation requested',
  'Agent verification lane opened at priority',
  'Escalation timer started (30 min)',
];

const PROTOCOL_MEDIUM = [
  'Agent review flagged for attention',
  'Propagation throttled pending review',
  'Source reconciliation initiated',
  'Standard escalation path engaged',
];

const PROTOCOL_LOW = [
  'Logged for periodic review',
  'Standard monitoring continues',
  'No propagation changes required',
];

const SEVERITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };
const SEVERITY_LEVELS = ['low', 'medium', 'high'] as const;

function tripwireProtocol(severity: Tripwire['severity']): string[] {
  if (severity === 'high') return PROTOCOL_HIGH;
  if (severity === 'medium') return PROTOCOL_MEDIUM;
  return PROTOCOL_LOW;
}

// ── Inspector views ──────────────────────────────────────────

function ZeusVerifyControls({
  epiconId,
  status,
  onVerify,
}: {
  epiconId: string;
  status: string;
  onVerify?: (payload: ZeusVerifyPayload) => Promise<ZeusVerifyResult>;
}) {
  const [note, setNote] = useState('');
  const [tier, setTier] = useState(3);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ZeusVerifyResult | null>(null);

  if (!onVerify) return null;

  // Only show for user-submitted pending EPICONs
  const isUserSubmitted = epiconId.includes('-USR-');
  if (!isUserSubmitted || status !== 'pending') {
    if (isUserSubmitted && status !== 'pending') {
      return (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs font-mono text-emerald-400">
          ZEUS verification complete — status: {status.toUpperCase()}
        </div>
      );
    }
    return null;
  }

  const handleVerify = async (outcome: 'hit' | 'miss') => {
    setBusy(true);
    try {
      const res = await onVerify({
        epiconId,
        outcome,
        finalStatus: outcome === 'hit' ? 'verified' : 'contradicted',
        finalConfidenceTier: tier,
        zeusNote: note,
      });
      setResult(res);
    } catch {
      setResult({ ok: false });
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className={cn(
        'rounded-lg border px-3 py-2 text-xs font-mono',
        result.ok
          ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
          : 'border-rose-500/20 bg-rose-500/5 text-rose-400',
      )}>
        {result.ok
          ? `ZEUS verification recorded. Author MII: ${result.miiScore?.toFixed(2) ?? 'n/a'} (${result.nodeTier ?? 'n/a'})`
          : 'Verification failed or already processed.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
          Final Tier
        </span>
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={cn(
                'rounded border px-2 py-1 text-[10px] font-mono transition',
                t === tier
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-slate-800 bg-slate-950 text-slate-500 hover:border-slate-700',
              )}
            >
              T{t}
            </button>
          ))}
        </div>
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="ZEUS verification note (optional)"
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white outline-none placeholder:text-slate-600 focus:border-amber-500/40"
      />

      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => handleVerify('hit')}
          className="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-mono uppercase tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {busy ? '...' : 'Verify (Hit)'}
        </button>
        <button
          disabled={busy}
          onClick={() => handleVerify('miss')}
          className="flex-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-mono uppercase tracking-[0.12em] text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
        >
          {busy ? '...' : 'Contradict (Miss)'}
        </button>
      </div>
    </div>
  );
}

function EpiconView({
  data,
  onZeusVerify,
}: {
  data: InspectorTarget & { kind: 'epicon' };
  onZeusVerify?: (payload: ZeusVerifyPayload) => Promise<ZeusVerifyResult>;
}) {
  const event = data.data;
  return (
    <div className="space-y-5">
      <div>
        <SmallLabel>Event</SmallLabel>
        <div className="mt-1 text-lg font-sans font-semibold text-white">
          {event.title}
        </div>
        <div className="mt-2 text-sm font-sans text-slate-300">
          {event.summary}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InspectorStat label="EPICON ID" value={event.id} />
        <InspectorStat label="Owner" value={event.ownerAgent} />
        <InspectorStat label="Status" value={event.status.toUpperCase()} />
        <InspectorStat
          label="Confidence"
          value={confidenceLabel(event.confidenceTier)}
        />
      </div>

      <div>
        <SmallLabel>Confidence Ladder</SmallLabel>
        <div className="mt-2 flex gap-2">
          {([0, 1, 2, 3, 4] as const).map((tier) => {
            const active = tier <= event.confidenceTier;
            return (
              <div
                key={tier}
                className={cn(
                  'flex-1 rounded-md border px-2 py-2 text-center text-[11px] font-mono uppercase tracking-[0.12em]',
                  active
                    ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                    : 'border-slate-800 bg-slate-950 text-slate-500',
                )}
              >
                T{tier}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <SmallLabel>Source Stack</SmallLabel>
        <div className="mt-2 flex flex-wrap gap-2">
          {event.sources.map((source) => (
            <span
              key={source}
              className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs font-mono text-slate-300"
            >
              {source}
            </span>
          ))}
        </div>
      </div>

      <div>
        <SmallLabel>Agent Trace</SmallLabel>
        <NumberedStepList items={event.trace} />
      </div>

      <div>
        <SmallLabel>ZEUS Verification</SmallLabel>
        <div className="mt-2">
          <ZeusVerifyControls
            epiconId={event.id}
            status={event.status}
            onVerify={onZeusVerify}
          />
        </div>
      </div>

      <div>
        <SmallLabel>Operator Notes</SmallLabel>
        <div className="mt-2 rounded-lg border border-dashed border-slate-800 bg-slate-950 p-3 text-sm font-sans text-slate-400">
          No override applied. Event remains within normal review lane.
        </div>
      </div>
    </div>
  );
}

function AgentView({ data }: { data: InspectorTarget & { kind: 'agent' } }) {
  const agent = data.data;
  return (
    <div className="space-y-5">
      <div>
        <SmallLabel>Agent</SmallLabel>
        <div className="mt-1 flex items-center gap-3">
          <div className={cn('h-4 w-4 rounded-full', agent.color)} />
          <div className="text-lg font-sans font-semibold text-white">
            {agent.name}
          </div>
        </div>
        <div className="mt-2 text-sm font-sans text-slate-300">{agent.role}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InspectorStat label="Agent ID" value={agent.id.toUpperCase()} />
        <InspectorStat label="Status" value={agent.status.toUpperCase()} />
        <InspectorStat
          label="Heartbeat"
          value={agent.heartbeatOk ? 'OK' : 'FAIL'}
        />
        <InspectorStat label="Role" value={agent.role} />
      </div>

      <div>
        <SmallLabel>Status Indicator</SmallLabel>
        <div className="mt-2 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
          <div className={cn('h-3 w-3 rounded-full', statusColor(agent.status))} />
          <span className="text-sm font-mono uppercase tracking-[0.15em] text-slate-200">
            {agent.status}
          </span>
        </div>
      </div>

      <div>
        <SmallLabel>Last Action</SmallLabel>
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm font-sans text-slate-300">
          {agent.lastAction}
        </div>
      </div>

      <div>
        <SmallLabel>Capabilities</SmallLabel>
        <NumberedStepList items={AGENT_CAPABILITIES[agent.id] ?? DEFAULT_CAPABILITIES} />
      </div>
    </div>
  );
}

function TripwireView({
  data,
}: {
  data: InspectorTarget & { kind: 'tripwire' };
}) {
  const tw = data.data;
  return (
    <div className="space-y-5">
      <div>
        <SmallLabel>Tripwire Alert</SmallLabel>
        <div className="mt-1 text-lg font-sans font-semibold text-white">
          {tw.label}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InspectorStat label="Tripwire ID" value={tw.id} />
        <InspectorStat label="Owner" value={tw.owner} />
        <InspectorStat label="Severity" value={tw.severity.toUpperCase()} />
        <InspectorStat label="Opened" value={tw.openedAt} />
      </div>

      <div>
        <SmallLabel>Severity Level</SmallLabel>
        <div className="mt-2 flex gap-2">
          {SEVERITY_LEVELS.map((level) => {
            const active =
              (SEVERITY_RANK[tw.severity] ?? 0) >= (SEVERITY_RANK[level] ?? 0);
            return (
              <div
                key={level}
                className={cn(
                  'flex-1 rounded-md border px-2 py-2 text-center text-[11px] font-mono uppercase tracking-[0.12em]',
                  active
                    ? tripwireStyle(level)
                    : 'border-slate-800 bg-slate-950 text-slate-500',
                )}
              >
                {level}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <SmallLabel>Current Action</SmallLabel>
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm font-sans text-slate-300">
          {tw.action}
        </div>
      </div>

      <div>
        <SmallLabel>Response Protocol</SmallLabel>
        <NumberedStepList items={tripwireProtocol(tw.severity)} />
      </div>
    </div>
  );
}

function GIView({ data }: { data: InspectorTarget & { kind: 'gi' } }) {
  const gi = data.data;
  return (
    <div className="space-y-5">
      <div>
        <SmallLabel>Governance Integrity</SmallLabel>
        <div className="mt-1 flex items-end gap-3">
          <div className={cn('text-3xl font-mono font-semibold transition-colors duration-700', giScoreColor(gi.score).text)}>
            {gi.score.toFixed(2)}
          </div>
          <div className={cn('pb-1 text-sm font-mono', gi.delta > 0 ? 'text-emerald-300' : gi.delta < 0 ? 'text-red-300' : 'text-slate-400')}>
            {gi.delta > 0
              ? `+${gi.delta.toFixed(2)}`
              : gi.delta.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InspectorStat
          label="Institutional Trust"
          value={`${Math.round(gi.institutionalTrust * 100)}%`}
        />
        <InspectorStat
          label="Info Reliability"
          value={`${Math.round(gi.infoReliability * 100)}%`}
        />
        <InspectorStat
          label="Consensus Stability"
          value={`${Math.round(gi.consensusStability * 100)}%`}
        />
        <InspectorStat
          label="Weekly Avg"
          value={`${Math.round(
            (gi.weekly.reduce((a, b) => a + b, 0) / gi.weekly.length) * 100,
          )}%`}
        />
      </div>

      <div>
        <SmallLabel>Score Breakdown</SmallLabel>
        <div className="mt-2 space-y-3">
          {[
            { label: 'Institutional Trust', value: gi.institutionalTrust },
            { label: 'Info Reliability', value: gi.infoReliability },
            { label: 'Consensus Stability', value: gi.consensusStability },
          ].map((m) => {
            const pct = Math.round(m.value * 100);
            return (
              <div key={m.label}>
                <div className="mb-1 flex items-center justify-between text-xs font-sans">
                  <span className="text-slate-400">{m.label}</span>
                  <span className="font-mono text-slate-300">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800">
                  <div
                    className={cn('h-2 rounded-full transition-all duration-500', metricBarColor(m.value))}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <SmallLabel>Weekly Trend</SmallLabel>
        <div className="mt-2 flex h-20 items-end gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          {gi.weekly.map((v, i) => (
            <div
              key={i}
              className={cn('flex-1 rounded-t opacity-80 transition-all duration-500', metricBarColor(v))}
              style={{ height: `${Math.max(12, v * 60)}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Substrate / Browser Shell views ──────────────────────────

function LedgerView({ data }: { data: InspectorTarget & { kind: 'ledger' } }) {
  const entry = data.data;
  return (
    <div className="space-y-5">
      <div>
        <SmallLabel>Ledger Entry</SmallLabel>
        <div className="mt-1 text-lg font-sans font-semibold text-white">
          {entry.summary}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InspectorStat label="Entry ID" value={entry.id} />
        <InspectorStat label="Cycle" value={entry.cycleId} />
        <InspectorStat label="Type" value={entry.type.toUpperCase()} />
        <InspectorStat label="Agent" value={entry.agentOrigin} />
        <InspectorStat label="Status" value={entry.status.toUpperCase()} />
        <InspectorStat
          label="GI Delta"
          value={
            entry.integrityDelta === 0
              ? '0.000'
              : `${entry.integrityDelta > 0 ? '+' : ''}${entry.integrityDelta.toFixed(3)}`
          }
        />
      </div>

      <div>
        <SmallLabel>Timestamp</SmallLabel>
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm font-mono text-slate-300">
          {entry.timestamp}
        </div>
      </div>

      <div>
        <SmallLabel>Provenance Chain</SmallLabel>
        <NumberedStepList
          items={[
            `Event originated from ${entry.agentOrigin}`,
            `Classified as ${entry.type} in cycle ${entry.cycleId}`,
            `Integrity delta: ${entry.integrityDelta >= 0 ? '+' : ''}${entry.integrityDelta.toFixed(3)}`,
            `Status: ${entry.status} — recorded to immutable ledger`,
          ]}
        />
      </div>
    </div>
  );
}

function ShardView({ data }: { data: InspectorTarget & { kind: 'shard' } }) {
  const shard = data.data;
  return (
    <div className="space-y-5">
      <div>
        <SmallLabel>Mobius Fractal Shard</SmallLabel>
        <div className="mt-1 text-lg font-sans font-semibold text-white">
          {shard.id}
        </div>
        <div className="mt-1 text-sm font-sans text-slate-300">
          Archetype: {shard.archetype} · Citizen: {shard.citizenId}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InspectorStat label="Weight" value={shard.weight.toFixed(2)} />
        <InspectorStat label="Quality" value={`${Math.round(shard.qualityScore * 100)}%`} />
        <InspectorStat label="Integrity Coeff" value={shard.integrityCoefficient.toFixed(2)} />
        <InspectorStat label="MII Delta" value={`+${shard.miiDelta.toFixed(3)}`} />
      </div>

      <div>
        <SmallLabel>Shard Metrics</SmallLabel>
        <div className="mt-2 space-y-3">
          {[
            { label: 'Weight', value: shard.weight },
            { label: 'Quality Score', value: shard.qualityScore },
            { label: 'Integrity Coefficient', value: shard.integrityCoefficient },
          ].map((m) => {
            const pct = Math.round(m.value * 100);
            return (
              <div key={m.label}>
                <div className="mb-1 flex items-center justify-between text-xs font-sans">
                  <span className="text-slate-400">{m.label}</span>
                  <span className="font-mono text-slate-300">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SentinelView({ data }: { data: InspectorTarget & { kind: 'sentinel' } }) {
  const s = data.data;
  return (
    <div className="space-y-5">
      <div>
        <SmallLabel>Sentinel</SmallLabel>
        <div className="mt-1 text-lg font-sans font-semibold text-white">
          {s.name}
        </div>
        <div className="mt-1 text-sm font-sans text-slate-300">{s.role}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InspectorStat label="Status" value={s.status.toUpperCase()} />
        <InspectorStat label="MII" value={s.integrity.toFixed(2)} />
        <InspectorStat label="Provider" value={s.provider} />
        <InspectorStat label="Domains" value={s.domains.join(', ')} />
      </div>

      <div>
        <SmallLabel>Integrity Score</SmallLabel>
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-xs font-sans">
            <span className="text-slate-400">MII</span>
            <span className="font-mono text-slate-300">{Math.round(s.integrity * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800">
            <div
              className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${Math.round(s.integrity * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div>
        <SmallLabel>Last Action</SmallLabel>
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm font-sans text-slate-300">
          {s.lastAction}
        </div>
      </div>

      <div>
        <SmallLabel>Domain Capabilities</SmallLabel>
        <div className="mt-2 flex flex-wrap gap-2">
          {s.domains.map((domain) => (
            <span
              key={domain}
              className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs font-mono text-slate-300"
            >
              {domain}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function AlertView({ data }: { data: InspectorTarget & { kind: 'alert' } }) {
  const alert = data.data;
  return (
    <div className="space-y-5">
      <div>
        <SmallLabel>Civic Radar Alert</SmallLabel>
        <div className="mt-1 text-lg font-sans font-semibold text-white">
          {alert.title}
        </div>
        <div className="mt-2 text-sm font-sans text-slate-300">
          {alert.impact}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InspectorStat label="Alert ID" value={alert.id} />
        <InspectorStat label="Severity" value={alert.severity.toUpperCase()} />
        <InspectorStat label="Category" value={alert.category} />
        <InspectorStat label="Source" value={alert.source} />
      </div>

      <div>
        <SmallLabel>Response Actions</SmallLabel>
        <NumberedStepList items={alert.actions} />
      </div>

      <div>
        <SmallLabel>Timeline</SmallLabel>
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm font-mono text-slate-300">
          {alert.timestamp}
        </div>
      </div>
    </div>
  );
}

// ── Signal Engine view ────────────────────────────────────────

function SignalView({ data }: { data: InspectorTarget & { kind: 'signal' } }) {
  const s = data.data;
  const classColor =
    s.classification === 'SIGNAL' ? 'text-emerald-300' :
    s.classification === 'DISTORTION' ? 'text-red-300' :
    'text-amber-300';

  return (
    <div className="space-y-5">
      <div>
        <SmallLabel>Event</SmallLabel>
        <div className="mt-1 text-lg font-sans font-semibold text-white">{s.title}</div>
        <div className="mt-2 text-sm font-sans text-slate-300 leading-relaxed">{s.summary}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InspectorStat label="Event ID" value={s.eventId} />
        <InspectorStat label="Category" value={s.category.toUpperCase()} />
      </div>

      <div>
        <SmallLabel>Classification</SmallLabel>
        <div className={`mt-2 text-xl font-mono font-bold ${classColor}`}>
          {s.classification}
        </div>
      </div>

      <div>
        <SmallLabel>Score Breakdown</SmallLabel>
        <div className="mt-2 space-y-3">
          {[
            { label: 'Signal (verification strength)', value: s.signal, color: 'bg-emerald-500' },
            { label: 'Narrative (amplification level)', value: s.narrative, color: 'bg-amber-500' },
            { label: 'Volatility (system reaction)', value: s.volatility, color: 'bg-rose-500' },
          ].map((m) => (
            <div key={m.label}>
              <div className="mb-1 flex items-center justify-between text-sm font-sans">
                <span className="text-slate-300">{m.label}</span>
                <span className="font-mono text-slate-400">{Math.round(m.value * 100)}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-800">
                <div className={`h-2.5 rounded-full ${m.color} transition-all duration-500`} style={{ width: `${Math.round(m.value * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {s.divergence > 0 && (
        <div>
          <SmallLabel>Divergence</SmallLabel>
          <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="text-sm font-sans text-amber-300">
              Narrative exceeds signal by <span className="font-mono font-bold">{Math.round(s.divergence * 100)}%</span>
            </div>
            <div className="mt-1 text-xs font-sans text-slate-400">
              When narrative amplification exceeds verification strength, the information field is unstable.
              Monitor for convergence (narrative drops to match signal) or escalation (divergence widens).
            </div>
          </div>
        </div>
      )}

      <div>
        <SmallLabel>What This Means</SmallLabel>
        <div className="mt-2 space-y-2 text-xs font-sans text-slate-400 leading-relaxed">
          <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
            <span className="mr-2 font-mono text-emerald-400">Signal</span>
            measures how well-verified the underlying event is across sources, confidence tiers, and agent processing depth.
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
            <span className="mr-2 font-mono text-amber-400">Narrative</span>
            measures the intensity of interpretation, amplification, and emotional language surrounding the event.
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
            <span className="mr-2 font-mono text-rose-400">Volatility</span>
            measures market and system reaction intensity — how much the world is moving in response.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────

function InspectorContent({
  target,
  onZeusVerify,
}: {
  target: InspectorTarget;
  onZeusVerify?: (payload: ZeusVerifyPayload) => Promise<ZeusVerifyResult>;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <SectionLabel
        title="Detail Inspector"
        subtitle={SUBTITLES[target.kind]}
      />

      <div className="mt-4">
        {target.kind === 'epicon' && <EpiconView data={target} onZeusVerify={onZeusVerify} />}
        {target.kind === 'agent' && <AgentView data={target} />}
        {target.kind === 'tripwire' && <TripwireView data={target} />}
        {target.kind === 'gi' && <GIView data={target} />}
        {target.kind === 'ledger' && <LedgerView data={target} />}
        {target.kind === 'shard' && <ShardView data={target} />}
        {target.kind === 'sentinel' && <SentinelView data={target} />}
        {target.kind === 'alert' && <AlertView data={target} />}
        {target.kind === 'signal' && <SignalView data={target} />}
      </div>
    </div>
  );
}

export default function DetailInspectorRail({
  target,
  onZeusVerify,
}: {
  target: InspectorTarget;
  onZeusVerify?: (payload: ZeusVerifyPayload) => Promise<ZeusVerifyResult>;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* ── Desktop / Tablet: sidebar rail ── */}
      <aside className="max-md:hidden col-span-3 max-lg:col-span-2 bg-slate-950/90">
        <div className="h-full p-4">
          <InspectorContent target={target} onZeusVerify={onZeusVerify} />
        </div>
      </aside>

      {/* ── Mobile: toggle button + bottom sheet ── */}
      <button
        onClick={() => setMobileOpen((v) => !v)}
        className={cn(
          'md:hidden fixed right-3 z-50 flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-mono shadow-lg transition-all',
          mobileOpen
            ? 'bottom-[55%] border-sky-500/40 bg-sky-500/20 text-sky-300'
            : 'bottom-[68px] border-slate-700 bg-slate-900 text-slate-300',
        )}
      >
        <span className="text-sm">{mobileOpen ? '▼' : '▲'}</span>
        Inspector
      </button>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sheet */}
      <div
        className={cn(
          'md:hidden fixed left-0 right-0 bottom-0 z-40 bg-slate-950 border-t border-slate-800 transition-transform duration-300 safe-bottom',
          mobileOpen ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ maxHeight: '55vh' }}
      >
        <div className="overflow-y-auto p-4" style={{ maxHeight: '55vh', paddingBottom: '70px' }}>
          <InspectorContent target={target} onZeusVerify={onZeusVerify} />
        </div>
      </div>
    </>
  );
}
