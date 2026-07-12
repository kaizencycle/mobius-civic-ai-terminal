'use client';

import { useEffect, useState } from 'react';
import { ZeusReverifyButton } from './ZeusReverifyButton';

type ZeusDispute = { cycle: string; message: string; ts: number };
type EpiconEscalation = {
  failures: number;
  severity: 'warn' | 'error' | 'critical' | 'alert';
  label: string;
  ts: number;
};

type SentinelSignals = {
  zeusDispute: ZeusDispute | null;
  epiconEscalation: EpiconEscalation | null;
};

const SEVERITY_STYLE: Record<EpiconEscalation['severity'], string> = {
  warn:     'border-amber-500/30 bg-amber-950/20 text-amber-400',
  error:    'border-rose-500/30 bg-rose-950/20 text-rose-400',
  critical: 'border-rose-600/40 bg-rose-950/30 text-rose-300',
  alert:    'border-red-600/50 bg-red-950/40 text-red-300',
};

function relTime(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function SentinelChamber() {
  const [signals, setSignals] = useState<SentinelSignals>({ zeusDispute: null, epiconEscalation: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sentinel/signals')
      .then((r) => r.ok ? r.json() as Promise<SentinelSignals> : Promise.reject())
      .then((data) => { setSignals(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const dispute = signals.zeusDispute;
  const escalation = signals.epiconEscalation;
  const disputeAge = dispute ? Date.now() - dispute.ts : null;
  const disputeActive = disputeAge !== null && disputeAge < 90 * 60 * 1000;

  return (
    <div className="flex flex-col h-full font-mono text-xs">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <span className="text-cyan-400 font-bold tracking-widest">≡ SENTINEL</span>
        <span className="text-zinc-600">integrity signal monitor</span>
        {loading && <span className="ml-auto text-zinc-600 animate-pulse">loading…</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* ZEUS Dispute Panel */}
        <div className={`rounded border px-3 py-3 ${disputeActive
          ? 'border-orange-500/30 bg-orange-950/20'
          : 'border-zinc-800 bg-zinc-950/40'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-bold tracking-widest ${disputeActive ? 'text-orange-400' : 'text-zinc-500'}`}>
              ZEUS DISPUTE
            </span>
            {disputeActive && disputeAge !== null && (
              <span className="ml-auto text-zinc-500">{relTime(disputeAge)}</span>
            )}
          </div>
          {disputeActive && dispute ? (
            <>
              <div className="text-zinc-300 mb-1">{dispute.message}</div>
              <div className="text-zinc-500">cycle: {dispute.cycle}</div>
            </>
          ) : (
            <div className="text-zinc-600">No active ZEUS dispute</div>
          )}
          <div className="mt-2">
            <ZeusReverifyButton />
          </div>
        </div>

        {/* OPT-03: known failure modes confirmed in C-324. Historical reference only —
            not re-derived from the live dispute, so do not present as its root cause. */}
        {disputeActive && (
          <div className="rounded border border-red-800/60 mt-1">
            <div className="px-3 py-2 bg-red-950/40 border-b border-red-800/40 text-[10px] text-red-400 font-bold tracking-widest">
              KNOWN FAILURE MODES (C-324 reference, not live-diagnosed)
            </div>
            {([
              {
                id: 'disp-001',
                system: 'EPICON',
                status: 'empty',
                detail: 'EPICON candidate queue empty — no events ingested this cycle',
                severity: 'WARN' as const,
                cta: 'POST /api/echo/ingest with test payload to unblock EPICON pipeline',
              },
              {
                id: 'disp-002',
                system: 'VAULT ATTEST',
                status: '404',
                detail: 'Vault attestation endpoint returning 404 — substrate write path broken',
                severity: 'CRITICAL' as const,
                cta: 'Verify SUBSTRATE_LEDGER_URL env var; check /api/vault/attest route exists',
              },
              {
                id: 'disp-003',
                system: 'JOURNAL',
                status: 'blocked',
                detail: 'Journal lane blocked — ledger returning 503 suspended on write attempt',
                severity: 'CRITICAL' as const,
                cta: 'Check Render ledger service status; inspect /api/ledger health endpoint',
              },
            ] as const).map((d) => (
              <div key={d.id} className="px-3 py-2.5 border-b border-zinc-800/60 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                    d.severity === 'CRITICAL'
                      ? 'text-red-400 border-red-800 bg-red-950/60 animate-pulse'
                      : 'text-amber-400 border-amber-800 bg-amber-950/60'
                  }`}>
                    {d.severity}
                  </span>
                  <span className="text-sky-400 font-bold text-[10px]">{d.system}</span>
                  <span className="text-zinc-500 font-mono text-[10px]">[{d.status}]</span>
                </div>
                <div className="text-zinc-200 text-[10px] mb-1">{d.detail}</div>
                <div className="text-amber-300 text-[9px] font-mono leading-relaxed">▸ {d.cta}</div>
              </div>
            ))}
          </div>
        )}

        {/* EPICON Escalation Panel */}
        <div className={`rounded border px-3 py-3 ${escalation
          ? SEVERITY_STYLE[escalation.severity]
          : 'border-zinc-800 bg-zinc-950/40 text-zinc-600'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-bold tracking-widest ${escalation ? '' : 'text-zinc-500'}`}>
              EPICON ESCALATION
            </span>
            {escalation && (
              <>
                <span className="px-1.5 py-0.5 rounded border text-[10px] uppercase">{escalation.severity}</span>
                <span className="ml-auto text-zinc-500">{escalation.failures.toLocaleString()} failures</span>
              </>
            )}
          </div>
          {escalation ? (
            <>
              <div className="mb-1">{escalation.label}</div>
              <div className="opacity-60">EPICON promotion lane blocked. Set SUBSTRATE_TOKEN in Vercel env vars to unblock.</div>
            </>
          ) : (
            <div>No active escalation</div>
          )}
        </div>

        {/* Sentinel law reference */}
        <div className="rounded border border-zinc-800 bg-zinc-950/40 px-3 py-3 text-zinc-500">
          <div className="text-cyan-300/70 uppercase tracking-widest mb-2">Sentinel Law</div>
          <div>EPICON-01 preserves meaning through EJ.</div>
          <div>EPICON-02 preserves intent before action.</div>
          <div>EPICON-03 preserves consensus and dissent before authority.</div>
        </div>
      </div>
    </div>
  );
}
