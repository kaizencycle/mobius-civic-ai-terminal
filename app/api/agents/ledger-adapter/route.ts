import { NextRequest, NextResponse } from 'next/server';
import {
  adaptAgentJournalToLedger,
  summarizeAgentLedgerPreview,
  type AgentLedgerAdapterPreview,
  type AgentLedgerJournalEntry,
} from '@/lib/agents/ledger-adapter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const VALID_MODES = new Set(['hot', 'canon', 'merged']);

function normalizeMode(value: string | null): string {
  const mode = (value ?? 'merged').trim().toLowerCase();
  return VALID_MODES.has(mode) ? mode : 'merged';
}

function normalizeLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? String(DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function isJournalEntry(value: unknown): value is AgentLedgerJournalEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<AgentLedgerJournalEntry>;
  return (
    typeof row.id === 'string' &&
    typeof row.agent === 'string' &&
    typeof row.cycle === 'string' &&
    typeof row.timestamp === 'string' &&
    typeof row.observation === 'string' &&
    typeof row.inference === 'string' &&
    typeof row.recommendation === 'string' &&
    typeof row.confidence === 'number' &&
    Array.isArray(row.derivedFrom) &&
    row.source === 'agent-journal'
  );
}

async function readJournalRows(request: NextRequest, mode: string, limit: number, agent?: string | null, cycle?: string | null) {
  const url = new URL('/api/agents/journal', request.nextUrl.origin);
  url.searchParams.set('mode', mode);
  url.searchParams.set('limit', String(limit));
  if (agent) url.searchParams.append('agent', agent.toUpperCase());
  if (cycle) url.searchParams.set('cycle', cycle);

  const response = await fetch(url, { cache: 'no-store' });
  // C-296 OPT-8: guard Content-Type before JSON.parse — mirrors the substrate
  // client fix; internal routes should always return JSON but this prevents a
  // SyntaxError 500 if the upstream ever cold-starts with an HTML error page.
  const ct = response.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return {
      ok: false as const,
      status: response.status,
      error: `journal_non_json_response (content-type: ${ct})`,
      entries: [] as AgentLedgerJournalEntry[],
      source: null,
    };
  }
  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    return {
      ok: false as const,
      status: response.status,
      error: payload?.error ?? 'journal_read_failed',
      entries: [] as AgentLedgerJournalEntry[],
      source: payload,
    };
  }

  const entries = Array.isArray(payload.entries)
    ? payload.entries.filter(isJournalEntry)
    : [];

  return {
    ok: true as const,
    status: response.status,
    entries,
    source: payload,
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = normalizeMode(params.get('mode'));
  const limit = normalizeLimit(params.get('limit'));
  const agent = params.get('agent');
  const cycle = params.get('cycle');
  const eligibleOnly = params.get('eligible_only') === 'true';

  const journal = await readJournalRows(request, mode, limit, agent, cycle);
  if (!journal.ok) {
    return NextResponse.json(
      {
        ok: false,
        readonly: true,
        error: journal.error,
        status: journal.status,
      },
      { status: journal.status || 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const previews: AgentLedgerAdapterPreview[] = journal.entries.map(adaptAgentJournalToLedger);
  const filtered: AgentLedgerAdapterPreview[] = eligibleOnly
    ? previews.filter((preview: AgentLedgerAdapterPreview) => preview.decision.eligible)
    : previews;
  const summary = summarizeAgentLedgerPreview(previews);

  return NextResponse.json(
    {
      ok: true,
      readonly: true,
      version: 'C-295.phase2.ledger-adapter-preview.v1',
      mode,
      filters: {
        agent: agent ? agent.toUpperCase() : null,
        cycle: cycle ?? null,
        eligible_only: eligibleOnly,
        limit,
      },
      summary,
      count: filtered.length,
      previews: filtered,
      canon: [
        'Agent Ledger Adapter is read-only in C-295 Phase 2.',
        'Preview rows are derived from agent journal entries and do not mutate Ledger, EPICON, Vault, MIC, Fountain, or Canon.',
        'Eligible previews require an explicit later write phase before becoming ledger events.',
      ],
      source: {
        journal_count: journal.entries.length,
        journal_mode: journal.source?.mode ?? mode,
        journal_sources: journal.source?.sources ?? null,
        journal_timestamp: journal.source?.timestamp ?? null,
      },
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    },
  );
}
