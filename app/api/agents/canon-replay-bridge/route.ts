import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type LedgerEntryLike = {
  id?: string;
  title?: string;
  summary?: string;
  tags?: string[];
  timestamp?: string;
  agentOrigin?: string;
  canonState?: string;
  proofSource?: string;
};

type LedgerPayload = {
  ok?: boolean;
  events?: LedgerEntryLike[];
  sources?: Record<string, number>;
  freshness?: Record<string, unknown>;
};

type CanonPayload = {
  ok?: boolean;
  count?: number;
  counts?: Record<string, number>;
  timeline?: Array<{ id?: string; type?: string; title?: string; hash?: string | null }>;
  reserve_blocks?: unknown[];
};

type ReplayPayload = {
  ok?: boolean;
  rebuild?: Record<string, unknown>;
  vault?: Record<string, unknown>;
  sources?: Array<{ id?: string; status?: string; detail?: string }>;
};

type FetchResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

async function getJson<T>(request: NextRequest, path: string): Promise<FetchResult<T>> {
  try {
    const response = await fetch(new URL(path, request.nextUrl.origin), { cache: 'no-store' });
    const data = (await response.json()) as T;
    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? data : null,
      error: response.ok ? null : `http_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'fetch_failed',
    };
  }
}

function isAgentReceipt(entry: LedgerEntryLike): boolean {
  const tags = entry.tags ?? [];
  return (
    entry.id?.startsWith('agent-action-') === true ||
    tags.includes('agent-action') ||
    tags.includes('receipt-bundle') ||
    tags.some((tag) => tag.startsWith('receipt:'))
  );
}

function summarizeReceipts(entries: LedgerEntryLike[]) {
  return entries.filter(isAgentReceipt).slice(0, 25).map((entry) => ({
    id: entry.id ?? null,
    title: entry.title ?? null,
    agentOrigin: entry.agentOrigin ?? null,
    timestamp: entry.timestamp ?? null,
    canonState: entry.canonState ?? null,
    proofSource: entry.proofSource ?? null,
    receipt_hash: (entry.tags ?? []).find((tag) => tag.startsWith('receipt:'))?.replace('receipt:', '') ?? null,
    quorum_hash: (entry.tags ?? []).find((tag) => tag.startsWith('quorum:'))?.replace('quorum:', '') ?? null,
  }));
}

export async function GET(request: NextRequest) {
  const [ledgerRes, canonRes, replayRes] = await Promise.all([
    getJson<LedgerPayload>(request, '/api/chambers/ledger'),
    getJson<CanonPayload>(request, '/api/substrate/canon?limit=25'),
    getJson<ReplayPayload>(request, '/api/system/replay/plan'),
  ]);

  const ledgerEvents = ledgerRes.data?.events ?? [];
  const agentReceipts = summarizeReceipts(ledgerEvents);
  const canonTimeline = canonRes.data?.timeline ?? [];
  const replaySources = replayRes.data?.sources ?? [];

  return NextResponse.json(
    {
      ok: ledgerRes.ok || canonRes.ok || replayRes.ok,
      readonly: true,
      version: 'C-297.phase10.canon-replay-bridge.v1',
      endpoints: {
        ledger: { ok: ledgerRes.ok, status: ledgerRes.status, error: ledgerRes.error },
        canon: { ok: canonRes.ok, status: canonRes.status, error: canonRes.error },
        replay: { ok: replayRes.ok, status: replayRes.status, error: replayRes.error },
      },
      ledger_receipts: {
        visible_count: agentReceipts.length,
        receipts: agentReceipts,
      },
      canon_bridge: {
        reserve_blocks_count: Array.isArray(canonRes.data?.reserve_blocks) ? canonRes.data?.reserve_blocks.length : null,
        timeline_count: canonTimeline.length,
        counts: canonRes.data?.counts ?? null,
        agent_receipts_are_canon_annotations: false,
        next_step: 'promote receipt hashes as canon timeline annotations only after explicit policy approval',
      },
      replay_bridge: {
        source_count: replaySources.length,
        rebuild: replayRes.data?.rebuild ?? null,
        vault: replayRes.data?.vault ?? null,
        agent_receipts_are_replay_inputs: agentReceipts.length > 0,
        next_step: 'replay inspector should display agent receipt hashes as proof inputs without mutating replay history',
      },
      integration_status: {
        ledger_visible: agentReceipts.length > 0,
        canon_readable: canonRes.ok,
        replay_readable: replayRes.ok,
        safe_to_mutate_canon: false,
        safe_to_mutate_replay: false,
      },
      canon_law: [
        'Agent action receipts may be ledger attestations first.',
        'Canon integration must be annotation-only until a dedicated policy approves promotion.',
        'Replay may consume receipt hashes as proof inputs but must not rewrite historical state.',
        'This bridge is read-only and does not mutate Ledger, Canon, Replay, Vault, MIC, Fountain, or GI.',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'canon-replay-bridge',
      },
    },
  );
}
