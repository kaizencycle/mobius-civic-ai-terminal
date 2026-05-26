'use client';

import type { TripwireEntry } from '@/lib/terminal/tripwire';

const AGENT_CONTEXT: Record<string, {
  role: string;
  confidence: number;
  lastCycle: string;
  trace: string[];
  cta: string;
}> = {
  DAEDALUS: {
    role: 'Self-Diagnostic',
    confidence: 0.41,
    lastCycle: 'C-319',
    trace: [
      'Self-ping issued to /api/v1/system/health',
      'Received HTTP 401 — auth token expired',
      'Token rotation not configured in Vercel env',
      'Confidence degraded from 0.79 → 0.41',
    ],
    cta: 'Rotate DAEDALUS_AUTH_TOKEN in Vercel dashboard and re-deploy',
  },
  HERMES: {
    role: 'Narrative Router',
    confidence: 0.74,
    lastCycle: 'C-321',
    trace: [
      'µ3 narrative signal computed as 0.000',
      'µ4 narrative signal computed as 0.000',
      'Root: empty journal lane — KV-to-substrate bridge gap',
      'GI suppressed by structural zero in HERMES component weight',
    ],
    cta: 'Write test journal entry via /api/v1/journal/ingest to unblock µ3/µ4',
  },
  ZEUS: {
    role: 'Verification Engine',
    confidence: 0.91,
    lastCycle: 'C-322',
    trace: [
      'Verification sweep issued against ATLAS C-323 heartbeat',
      'Substrate POST returned 422 HTML error body',
      'Root: wrong write target — terminal writing directly to GitHub',
      'Resolved C-321: redirected POST to Civic Protocol Core Ledger',
    ],
    cta: 'Confirm ledger endpoint matches SUBSTRATE_LEDGER_URL env var',
  },
  ATLAS: {
    role: 'Sentinel Orchestrator',
    confidence: 0.87,
    lastCycle: 'C-323',
    trace: [
      'GI floor breach detected: confidence dropped to 0.60',
      'HERMES µ3/µ4 contributing structural zeros to GI',
      'DAEDALUS degraded — reducing orchestration quorum',
      'Manual operator override resolved C-320',
    ],
    cta: 'Review HERMES µ3/µ4 and DAEDALUS auth as root causes',
  },
};

interface Props {
  entry: TripwireEntry;
  onClose: () => void;
}

export function TripwireDrillDown({ entry, onClose }: Props) {
  const ctx = AGENT_CONTEXT[entry.agent];

  return (
    <div className="w-72 border-l border-zinc-800 bg-zinc-950 flex flex-col font-mono text-xs overflow-y-auto flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <span className="text-sky-400 font-bold">{entry.agent}</span>
        <button type="button" onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">✕</button>
      </div>
      {ctx ? (
        <div className="px-4 py-3 space-y-4">
          <div>
            <div className="text-zinc-500 text-[10px] tracking-widest uppercase mb-1">Role</div>
            <div className="text-zinc-200">{ctx.role}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-[10px] tracking-widest uppercase mb-1">Confidence</div>
            <div className={`font-bold ${
              ctx.confidence < 0.60 ? 'text-red-400' :
              ctx.confidence < 0.75 ? 'text-amber-400' :
              'text-green-400'
            }`}>
              {ctx.confidence.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-zinc-500 text-[10px] tracking-widest uppercase mb-2">Agent Trace</div>
            <ol className="space-y-1.5">
              {ctx.trace.map((step, i) => (
                <li key={i} className="flex gap-2 text-zinc-400 leading-relaxed">
                  <span className="text-zinc-700 flex-shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="border border-amber-800/50 bg-amber-950/30 rounded p-3">
            <div className="text-amber-400 text-[10px] tracking-widest uppercase mb-1">Operator Action</div>
            <div className="text-amber-200 leading-relaxed">{ctx.cta}</div>
          </div>
          {entry.resolved && entry.resolvedBy && (
            <div className="border border-green-800/50 bg-green-950/30 rounded p-3">
              <div className="text-green-400 text-[10px] tracking-widest uppercase mb-1">Resolved By</div>
              <div className="text-green-200">{entry.resolvedBy}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 text-zinc-500">No trace context available for {entry.agent}.</div>
      )}
    </div>
  );
}
