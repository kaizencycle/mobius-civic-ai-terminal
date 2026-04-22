'use client';

import type { MutableRefObject, ReactNode } from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import type { MicroSignal } from '@/lib/agents/micro/core';
import type { SentimentDomainKey } from '@/lib/terminal/globePins';
import {
  GLOBE_DOMAIN_ORDER,
  domainBarColor,
  extractUsgsSamples,
  freshnessLabel,
  gdeltDeadLane,
  partitionMicroSignals,
  pickLatestMiiByAgent,
  type GlobeDashboardBundle,
  type MiiAgentScore,
} from '@/components/terminal/chambers/globeDashboardExtras';
import type { GlobeViewControls } from '@/components/terminal/chambers/types';
import { useAPODThumb } from '@/hooks/useAPODThumb';
import { cn } from '@/lib/utils';

type SentimentDomain = {
  key: SentimentDomainKey;
  label: string;
  agent: string;
  score: number | null;
  status: 'nominal' | 'stressed' | 'critical' | 'unknown';
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object') return null;
  return v as Record<string, unknown>;
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}Z`;
}

function magPillClass(m: number): string {
  if (m >= 5) return 'border-amber-500/60 bg-amber-500/15 text-amber-200';
  if (m >= 4) return 'border-amber-500/40 bg-amber-500/10 text-amber-100';
  return 'border-slate-600 bg-slate-800/80 text-slate-400';
}

function CollapsiblePanel(props: {
  id: string;
  title: string;
  subtitle: string | null;
  freshness?: number | null;
  badge?: string | null;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  const panelId = `${props.id}-panel`;
  return (
    <section className="rounded-md border border-white/[0.08] bg-[#020408]/90 shadow-sm backdrop-blur-sm">
      <button
        type="button"
        id={`${props.id}-trigger`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-2 border-b border-white/[0.06] p-3 text-left transition hover:bg-white/[0.04] active:bg-white/[0.06]"
      >
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            <span>{props.title}</span>
            {props.badge ? (
              <span className="rounded border border-amber-500/30 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wide text-amber-300/90">
                {props.badge}
              </span>
            ) : null}
          </h3>
          {props.subtitle ? <p className="mt-0.5 text-[9px] leading-snug text-slate-600">{props.subtitle}</p> : null}
          <p
            className={cn(
              'mt-0.5 text-[9px]',
              props.freshness == null || props.freshness < 300
                ? 'text-slate-600'
                : props.freshness < 1800
                  ? 'text-amber-500/80'
                  : 'text-rose-400/80',
            )}
          >
            {freshnessLabel(props.freshness ?? null)}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-slate-500" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={`${props.id}-trigger`}
        className={cn('overflow-hidden transition-[max-height] duration-200 ease-out', open ? 'max-h-[min(70vh,520px)]' : 'max-h-0')}
      >
        <div className="max-h-[min(70vh,520px)] overflow-y-auto overscroll-y-contain p-3 pt-2 [-webkit-overflow-scrolling:touch]">
          {props.children}
        </div>
      </div>
    </section>
  );
}

const MII_ORDER = ['ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA', 'HERMES', 'ECHO', 'DAEDALUS'] as const;

export default function GlobeChapterDashboards(props: {
  micro: { allSignals?: MicroSignal[]; composite?: number; instrumentCount?: number } | null;
  domains: SentimentDomain[];
  dashboard: GlobeDashboardBundle | null;
  globeControlsRef?: MutableRefObject<GlobeViewControls | null>;
  globeVisible?: boolean;
}) {
  const { micro, domains, dashboard, globeControlsRef, globeVisible } = props;
  const domainByKey = Object.fromEntries(domains.map((d) => [d.key, d])) as Record<string, SentimentDomain>;

  const eveStrip = dashboard?.eveStrip ?? null;
  const seismic = extractUsgsSamples(dashboard?.echoEpicon ?? []);
  const { environmental, markets, governance } = partitionMicroSignals(micro);
  const gdeltDead = gdeltDeadLane(micro);
  const miiMap = pickLatestMiiByAgent(dashboard?.miiFeed ?? null);

  const kv = asRecord(dashboard?.kvHealth);
  const rt = asRecord(dashboard?.runtime);
  const twRoot = asRecord(dashboard?.tripwire);
  const tw = asRecord(twRoot?.tripwire) ?? twRoot;
  const vault = asRecord(dashboard?.vault);
  const mic = asRecord(dashboard?.micReadiness);
  const panelAge = dashboard?.panelAgeSeconds ?? {};
  const signalWarning = dashboard?.signalWarnings?.[0] ?? null;

  const inProg = typeof vault?.in_progress_balance === 'number' ? vault.in_progress_balance : null;
  const thr = typeof vault?.activation_threshold === 'number' ? vault.activation_threshold : 50;
  const tranchePct = inProg != null && thr > 0 ? Math.min(100, (inProg / thr) * 100) : null;
  const hashCov = typeof vault?.hash_coverage_pct === 'number' ? vault.hash_coverage_pct : null;
  const fountain = vault?.fountain_status != null ? String(vault.fountain_status) : null;
  const sustainMet = vault?.sustain_cycles_met === true;
  const sustainReq = typeof vault?.sustain_cycles_required === 'number' ? vault.sustain_cycles_required : 5;

  const pulseInstr = typeof rt?.pulse === 'object' && rt.pulse !== null ? (rt.pulse as Record<string, unknown>).instruments : null;

  const apod = (micro?.allSignals ?? []).find((s) => s.source.toLowerCase().includes('apod'));
  const { title: apodTitle, thumb: apodThumb } = useAPODThumb(apod?.label ?? null);

  const uid = useId().replace(/:/g, '');
  const onDomainTap = useCallback(
    (key: SentimentDomainKey) => {
      if (globeVisible && globeControlsRef?.current) {
        globeControlsRef.current.focusDomain(key);
      }
    },
    [globeVisible, globeControlsRef],
  );

  const [selSig, setSelSig] = useState<MicroSignal | null>(null);
  useEffect(() => {
    setSelSig(null);
  }, [micro]);

  return (
    <div className="flex min-h-[min(28vh,200px)] flex-1 flex-col border-t border-white/[0.08] bg-[#020408]/98">
      <div className="max-h-[min(55vh,480px)] min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 py-3 sm:max-h-[min(50vh,560px)] sm:px-3 [-webkit-overflow-scrolling:touch]">
        {eveStrip ? (
          <div className="mb-3 rounded border border-amber-500/35 bg-amber-950/40 px-3 py-2 text-[10px] leading-snug text-amber-100/95">
            <span className="font-semibold text-amber-200/90">EVE · </span>
            {eveStrip}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 scroll-pb-24 pb-2 md:scroll-pb-8 lg:grid-cols-2 xl:grid-cols-3">
          <CollapsiblePanel
            id={`${uid}-sent`}
            title="Sentiment domains"
            subtitle={
              globeVisible
                ? 'Tap a row to focus that domain on the globe'
                : 'Switch to Globe to focus pins by domain'
            }
            freshness={panelAge.sentiment ?? null}
            defaultOpen
          >
            <div className="space-y-2">
              {GLOBE_DOMAIN_ORDER.map((key) => {
                const d = domainByKey[key];
                const score = d?.score ?? null;
                const w = score != null ? `${Math.round(score * 100)}%` : '0%';
                const bg = domainBarColor(key, score);
                const domainSignals = (micro?.allSignals ?? []).filter((s) => {
                  const src = `${s.source} ${s.label}`.toLowerCase();
                  if (key === 'narrative') return src.includes('gdelt') || src.includes('reddit') || src.includes('hacker');
                  if (key === 'financial') return src.includes('coingecko') || src.includes('fx') || src.includes('bitcoin');
                  if (key === 'environ') return src.includes('usgs') || src.includes('eonet') || src.includes('meteo') || src.includes('apod');
                  if (key === 'civic') return src.includes('federal register');
                  if (key === 'institutional') return src.includes('data.gov');
                  return src.includes('github') || src.includes('npm');
                });
                const deadCount = domainSignals.filter((s) => s.value === 0 && (s.severity === 'critical' || s.source.toLowerCase().includes('gdelt') || s.source.toLowerCase().includes('reddit'))).length;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onDomainTap(key)}
                    disabled={!globeVisible}
                    className={cn(
                      'flex w-full items-center gap-2 rounded py-0.5 text-left transition',
                      globeVisible ? 'hover:bg-white/[0.06] active:bg-white/[0.08]' : 'cursor-default opacity-80',
                    )}
                  >
                    <div className="w-24 shrink-0 text-[9px] uppercase tracking-wide text-slate-500">{d?.label ?? key}</div>
                    <div className="relative h-2 flex-1 overflow-hidden rounded bg-white/[0.06]">
                      <div className="absolute left-0 top-0 h-full rounded transition-all" style={{ width: w, background: bg }} />
                    </div>
                    <div className="w-10 shrink-0 text-right font-mono text-[11px] text-slate-200">
                      {score != null ? score.toFixed(2) : '—'}
                    </div>
                    {deadCount > 0 ? (
                      <span className="rounded border border-rose-500/40 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wide text-rose-300/90">
                        dead lane
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel id={`${uid}-seq`} title="Seismic · EPICON" subtitle="ECHO EPICON ingest with coordinates" freshness={panelAge.seismic ?? null}>
            {seismic.length === 0 ? (
              <p className="text-[10px] text-slate-500">No seismic EPICON events in current sweep.</p>
            ) : (
              <ul className="space-y-1 font-mono text-[10px] text-slate-300">
                {seismic.map((r, i) => (
                  <li key={`${r.mag}-${i}`} className="flex items-center gap-2">
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 font-bold ${magPillClass(r.mag)}`}>
                      M{r.mag.toFixed(1)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-400">{r.place}</span>
                    <span className="shrink-0 text-slate-600">{fmtTime(r.timeMs)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CollapsiblePanel>

          <CollapsiblePanel id={`${uid}-env`} title="Environmental · ECHO lane" subtitle="GAIA / ECHO micro (non-seismic)" freshness={panelAge.environmental ?? null}>
            {environmental.length === 0 ? (
              <p className="text-[10px] text-slate-500">No environmental instruments in sweep.</p>
            ) : (
              <ul className="space-y-1 text-[10px] leading-snug text-slate-400">
                {environmental.map((s) => (
                  <li key={`${s.agentName}-${s.source}-${s.label}`}>
                    <button
                      type="button"
                      onClick={() => setSelSig(s)}
                      className={cn(
                        'w-full rounded px-1 py-0.5 text-left transition hover:bg-white/[0.06]',
                        selSig === s ? 'bg-cyan-950/40 ring-1 ring-cyan-500/30' : '',
                      )}
                    >
                      <span className="text-slate-500">{s.agentName}</span> · {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {apodTitle ? (
              <div className="mt-2 flex items-center gap-2 rounded border border-slate-700/70 bg-slate-900/50 p-1.5">
                {apodThumb ? <img src={apodThumb} alt={apodTitle} className="h-10 w-10 rounded object-cover opacity-80" /> : null}
                <span className="min-w-0 truncate font-mono text-[10px] text-slate-300">{apodTitle}</span>
              </div>
            ) : null}
          </CollapsiblePanel>

          <CollapsiblePanel
            id={`${uid}-mkt`}
            title="Markets · governance"
            subtitle="Tap a row for raw label"
            freshness={panelAge.markets ?? null}
            badge={signalWarning ? `${signalWarning.count} absent` : null}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-600">Markets</div>
                <ul className="space-y-1 text-[10px] text-slate-400">
                  {markets.length === 0 ? <li className="text-slate-600">—</li> : null}
                  {markets.map((s) => (
                    <li key={`m-${s.source}-${s.label}`}>
                      <button
                        type="button"
                        onClick={() => setSelSig(s)}
                        className={cn(
                          'w-full rounded px-1 py-0.5 text-left hover:bg-white/[0.06]',
                          selSig === s ? 'bg-cyan-950/40 ring-1 ring-cyan-500/30' : '',
                        )}
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-[9px] uppercase tracking-wide text-slate-600">Governance</div>
                <ul className="space-y-1 text-[10px] text-slate-400">
                  {governance.length === 0 ? <li className="text-slate-600">—</li> : null}
                  {governance.map((s) => (
                    <li key={`g-${s.source}-${s.label}`}>
                      <button
                        type="button"
                        onClick={() => setSelSig(s)}
                        className={cn(
                          'w-full rounded px-1 py-0.5 text-left hover:bg-white/[0.06]',
                          selSig === s ? 'bg-cyan-950/40 ring-1 ring-cyan-500/30' : '',
                        )}
                      >
                        {s.label}
                        {gdeltDead && s.source.toLowerCase().includes('gdelt') ? (
                          <span className="ml-1 text-rose-400/90">· dead lane</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel id={`${uid}-mii`} title="Agent MII" subtitle="Latest per agent from mii:feed" freshness={panelAge.mii ?? null}>
            <div className="space-y-1.5">
              {MII_ORDER.map((agent) => {
                const row: MiiAgentScore | undefined = miiMap[agent];
                const v = row?.mii ?? null;
                return (
                  <div key={agent} className="flex items-center gap-2">
                    <div className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-wide text-slate-500">{agent}</div>
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded bg-white/[0.06]">
                      {v != null ? (
                        <div
                          className="absolute left-0 top-0 h-full rounded bg-sky-500/80"
                          style={{ width: `${Math.round(v * 100)}%` }}
                        />
                      ) : null}
                    </div>
                    <div className="w-9 shrink-0 text-right font-mono text-[10px] text-slate-200">{v != null ? v.toFixed(2) : '—'}</div>
                  </div>
                );
              })}
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel id={`${uid}-vault`} title="Vault · tranche" subtitle="/api/vault/status" freshness={panelAge.vault ?? null}>
            <div className="space-y-2 text-[10px] text-slate-400">
              {typeof vault?.seals_audit_count === 'number' && vault.seals_audit_count > 0 && (inProg ?? 999) < 5 ? (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-300">
                  ◈ Seal {vault.seals_audit_count} formed · tranche complete · reserve accumulating toward Seal {vault.seals_audit_count + 1}
                </div>
              ) : null}
              {inProg != null ? (
                <>
                  <div className="flex justify-between font-mono text-slate-300">
                    <span>Tranche {typeof vault?.seals_audit_count === 'number' ? vault.seals_audit_count + 1 : '—'}</span>
                    <span>
                      {inProg.toFixed(2)} / {thr.toFixed(2)}
                    </span>
                  </div>
                  {tranchePct != null ? (
                    <div className="relative h-2 overflow-hidden rounded bg-white/[0.06]">
                      <div
                        className="absolute left-0 top-0 h-full rounded bg-emerald-500/75"
                        style={{ width: `${tranchePct.toFixed(1)}%` }}
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-slate-600">Vault lane unavailable or empty.</p>
              )}
              {hashCov != null ? (
                <div>
                  Hash coverage: <span className="text-emerald-300/90">{hashCov}%</span>
                </div>
              ) : null}
              {fountain ? (
                <div>
                  Fountain: <span className="text-slate-200">{fountain}</span>
                </div>
              ) : null}
              <div>
                Sustain:{' '}
                <span className={sustainMet ? 'text-emerald-300' : 'text-rose-300/90'}>
                  {sustainMet ? `met (${sustainReq} required)` : `pending · ${sustainReq} consecutive required`}
                </span>
              </div>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel id={`${uid}-infra`} title="Infrastructure pulse" subtitle="KV · backup Redis · pulse · tripwire" freshness={panelAge.infrastructure ?? null}>
            <ul className="space-y-1 font-mono text-[10px] text-slate-400">
              <li>
                KV primary:{' '}
                <span className={kv?.available === false ? 'text-rose-300' : 'text-emerald-300'}>
                  {kv?.available === false ? 'offline' : 'ok'}
                </span>
                {typeof kv?.latencyMs === 'number' ? <span className="text-slate-600"> · {kv.latencyMs}ms</span> : null}
              </li>
              <li>
                Backup Redis:{' '}
                <span className={asRecord(kv?.backup_redis)?.available === false ? 'text-rose-300' : 'text-emerald-300'}>
                  {asRecord(kv?.backup_redis)?.available === false ? 'offline' : 'ok'}
                </span>
              </li>
              {typeof pulseInstr === 'number' ? (
                <li>
                  System pulse instruments: <span className="text-slate-200">{pulseInstr}</span>
                </li>
              ) : null}
              {tw ? (
                <li>
                  Tripwire: <span className="text-slate-200">{String(tw.level ?? tw.elevated ?? '')}</span>
                </li>
              ) : null}
            </ul>
          </CollapsiblePanel>
        </div>

        {selSig ? (
          <div className="mt-2 rounded border border-cyan-500/25 bg-cyan-950/20 p-2 font-mono text-[10px] text-slate-300">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[9px] uppercase tracking-wide text-cyan-400/90">Signal</span>
              <button
                type="button"
                onClick={() => setSelSig(null)}
                className="rounded border border-slate-600 px-2 py-0.5 text-[9px] text-slate-400"
              >
                Clear
              </button>
            </div>
            <div className="text-slate-200">{selSig.label}</div>
            <div className="mt-1 text-slate-500">
              {selSig.agentName} · {selSig.source} · value {selSig.value.toFixed(3)} · {selSig.severity}
            </div>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-white/[0.08] bg-[#020408] px-2 py-2 sm:px-3">
        {mic && typeof mic.replay === 'object' && mic.replay !== null ? (
          <div className="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600">
            MIC readiness · replay{' '}
            {(mic.replay as Record<string, unknown>).replayPressure != null
              ? Number((mic.replay as Record<string, unknown>).replayPressure).toFixed(3)
              : '—'}{' '}
            · sustain {String((mic.sustain as Record<string, unknown> | undefined)?.status ?? '—')}
          </div>
        ) : null}

        {micro?.composite != null ? (
          <div className="mt-1 text-center font-mono text-[9px] text-slate-600">
            {apod ? (
              <>
                APOD · {apod.label.replace(/^APOD:\s*/i, '')} ·{' '}
              </>
            ) : null}
            {micro.instrumentCount ?? '—'} instruments · composite {micro.composite.toFixed(3)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
