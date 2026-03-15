import type { InspectorTarget, Tripwire } from '@/lib/terminal/types';
import { confidenceLabel, statusColor, tripwireStyle, cn } from '@/lib/terminal/utils';
import SectionLabel from './SectionLabel';

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

function EpiconView({ data }: { data: InspectorTarget & { kind: 'epicon' } }) {
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
          <div className="text-3xl font-mono font-semibold text-white">
            {gi.score.toFixed(2)}
          </div>
          <div className="pb-1 text-sm font-mono text-emerald-300">
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
                    className="h-2 rounded-full bg-sky-500 transition-all duration-500"
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
              className="flex-1 rounded-t bg-sky-500/80 transition-all duration-500"
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

// ── Main component ───────────────────────────────────────────

export default function DetailInspectorRail({
  target,
}: {
  target: InspectorTarget;
}) {
  return (
    <aside className="col-span-3 bg-slate-950/90">
      <div className="h-full p-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <SectionLabel
            title="Detail Inspector"
            subtitle={SUBTITLES[target.kind]}
          />

          <div className="mt-4">
            {target.kind === 'epicon' && <EpiconView data={target} />}
            {target.kind === 'agent' && <AgentView data={target} />}
            {target.kind === 'tripwire' && <TripwireView data={target} />}
            {target.kind === 'gi' && <GIView data={target} />}
            {target.kind === 'ledger' && <LedgerView data={target} />}
            {target.kind === 'shard' && <ShardView data={target} />}
            {target.kind === 'sentinel' && <SentinelView data={target} />}
            {target.kind === 'alert' && <AlertView data={target} />}
          </div>
        </div>
      </div>
    </aside>
  );
}
