import { NextRequest, NextResponse } from 'next/server';
import { getOperatorSession } from '@/lib/auth/session';
import { createAgentAttestationSignature } from '@/lib/agents/attestation-signature';
import { authorizeLedgerWriteByQuorum } from '@/lib/agents/quorum-trust';
import {
  adaptAgentJournalToLedger,
  type AgentLedgerAdapterPreview,
  type AgentLedgerJournalEntry,
} from '@/lib/agents/ledger-adapter';
import { kvGet, kvSet } from '@/lib/kv/store';
import { getServiceAuthError } from '@/lib/security/serviceAuth';
import { writeToSubstrate, type SubstrateEntry } from '@/lib/substrate/client';
import type { LedgerEntry } from '@/lib/terminal/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;
const RECEIPT_TTL_SECONDS = 60 * 60 * 24 * 30;
const VALID_MODES = new Set(['hot', 'canon', 'merged']);

type AdapterWriteBody = {
  mode?: string;
  limit?: number;
  agent?: string;
  cycle?: string;
  journal_id?: string;
  dry_run?: boolean;
  quorum_required?: boolean;
  zeus_verified?: boolean;
};

type AdapterWriteReceipt = {
  journal_id: string;
  ledger_entry_id: string;
  external_entry_id: string | null;
  agent: string;
  cycle: string;
  status: 'written' | 'duplicate' | 'failed' | 'skipped';
  reason: string;
  timestamp: string;
};

function normalizeMode(value: string | null | undefined): string {
  const mode = (value ?? 'merged').trim().toLowerCase();
  return VALID_MODES.has(mode) ? mode : 'merged';
}

function normalizeLimit(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? String(DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function receiptKey(journalId: string): string {
  return `agent-ledger-adapter:receipt:${journalId}`;
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

async function readJournalRows(request: NextRequest, args: { mode: string; limit: number; agent: string | null; cycle: string | null }) {
  const url = new URL('/api/agents/journal', request.nextUrl.origin);
  url.searchParams.set('mode', args.mode);
  url.searchParams.set('limit', String(args.limit));
  if (args.agent) url.searchParams.append('agent', args.agent.toUpperCase());
  if (args.cycle) url.searchParams.set('cycle', args.cycle);

  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    return {
      ok: false as const,
      status: response.status,
      error: payload?.error ?? 'journal_read_failed',
      entries: [] as AgentLedgerJournalEntry[],
    };
  }

  const entries = Array.isArray(payload.entries) ? payload.entries.filter(isJournalEntry) : [];
  return { ok: true as const, status: response.status, entries };
}

async function readLedgerRows(request: NextRequest): Promise<LedgerEntry[]> {
  const response = await fetch(new URL('/api/chambers/ledger', request.nextUrl.origin), { cache: 'no-store' });
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload?.events) ? payload.events : [];
}

function previewToSubstrateInput(preview: AgentLedgerAdapterPreview, options: { quorumRequired: boolean; zeusVerified: boolean }): SubstrateEntry {
  const entry = preview.ledger_entry;
  const tags = entry.tags ?? [];
  const severityTag = tags.find((tag) => tag === 'critical' || tag === 'elevated' || tag === 'nominal');
  const severity: SubstrateEntry['severity'] = severityTag === 'critical' || severityTag === 'elevated' ? severityTag : 'nominal';
  const category: SubstrateEntry['category'] = entry.category ?? 'infrastructure';
  const signature = createAgentAttestationSignature(preview, {
    quorumRequired: options.quorumRequired,
    zeusVerified: options.zeusVerified,
  });

  return {
    id: entry.id,
    agent: preview.agent,
    agentOrigin: preview.agent,
    cycle: preview.cycle,
    title: entry.title ?? `${preview.agent} ledger attestation`,
    summary: entry.summary,
    category,
    severity,
    source: 'agent-journal',
    confidence: typeof entry.confidenceTier === 'number' ? entry.confidenceTier / 4 : undefined,
    derivedFrom: [preview.journal_id],
    tags: Array.from(new Set([...tags, 'multi-agent-ledger-write', 'c295-phase10', signature.payload_hash])),
    verified: preview.decision.canonState === 'attested' || options.zeusVerified,
    attestation_signature: signature,
  };
}

export async function POST(request: NextRequest) {
  const authError = getServiceAuthError(request);
  const operator = await getOperatorSession();
  if (authError && !operator) return authError;

  let body: AdapterWriteBody = {};
  try {
    body = (await request.json()) as AdapterWriteBody;
  } catch {
    body = {};
  }

  const mode = normalizeMode(body.mode);
  const limit = normalizeLimit(body.limit);
  const agent = optionalString(body.agent);
  const cycle = optionalString(body.cycle);
  const journalId = optionalString(body.journal_id);
  const dryRun = body.dry_run === true;
  const quorumRequired = body.quorum_required === true;
  const zeusVerified = body.zeus_verified === true;

  const journal = await readJournalRows(request, { mode, limit, agent, cycle });
  if (!journal.ok) {
    return NextResponse.json(
      { ok: false, error: journal.error, status: journal.status },
      { status: journal.status || 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const previews: AgentLedgerAdapterPreview[] = journal.entries
    .map(adaptAgentJournalToLedger)
    .filter((preview: AgentLedgerAdapterPreview) => preview.decision.eligible)
    .filter((preview: AgentLedgerAdapterPreview) => (journalId ? preview.journal_id === journalId : true));

  const ledgerEntries = quorumRequired ? await readLedgerRows(request) : [];
  const receipts: AdapterWriteReceipt[] = [];

  for (let i = 0; i < previews.length; i++) {
    const preview = previews[i]!;
    const key = receiptKey(preview.journal_id);
    const existing = existingReceipts[i];
    if (existing) {
      receipts.push({ ...existing, status: 'duplicate', reason: 'journal_already_written_to_ledger' });
      continue;
    }

    if (quorumRequired) {
      const decision = authorizeLedgerWriteByQuorum(ledgerEntries, preview.agent, preview.cycle);
      if (!decision.authorized) {
        receipts.push({
          journal_id: preview.journal_id,
          ledger_entry_id: preview.ledger_entry.id,
          external_entry_id: null,
          agent: preview.agent,
          cycle: preview.cycle,
          status: 'skipped',
          reason: `quorum_blocked:${decision.reason}`,
          timestamp: new Date().toISOString(),
        });
        continue;
      }
    }

    if (dryRun) {
      receipts.push({
        journal_id: preview.journal_id,
        ledger_entry_id: preview.ledger_entry.id,
        external_entry_id: null,
        agent: preview.agent,
        cycle: preview.cycle,
        status: 'skipped',
        reason: 'dry_run_no_write',
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    const write = await writeToSubstrate(previewToSubstrateInput(preview, { quorumRequired, zeusVerified }));
    const receipt: AdapterWriteReceipt = {
      journal_id: preview.journal_id,
      ledger_entry_id: preview.ledger_entry.id,
      external_entry_id: write.entryId ?? null,
      agent: preview.agent,
      cycle: preview.cycle,
      status: write.ok ? 'written' : 'failed',
      reason: write.ok ? 'eligible_agent_journal_written_to_ledger' : (write.error ?? 'ledger_write_failed'),
      timestamp: new Date().toISOString(),
    };
    receipts.push(receipt);
    if (write.ok) await kvSet(key, receipt, RECEIPT_TTL_SECONDS);
  }

  return NextResponse.json(
    {
      ok: true,
      readonly: false,
      version: 'C-296.phase7.quorum-gated-agent-ledger-write.v1',
      dry_run: dryRun,
      filters: {
        mode,
        limit,
        agent: agent ? agent.toUpperCase() : null,
        cycle,
        journal_id: journalId,
        quorum_required: quorumRequired,
        zeus_verified: zeusVerified,
      },
      summary: {
        journal_entries: journal.entries.length,
        eligible: previews.length,
        written: receipts.filter((receipt) => receipt.status === 'written').length,
        duplicate: receipts.filter((receipt) => receipt.status === 'duplicate').length,
        failed: receipts.filter((receipt) => receipt.status === 'failed').length,
        skipped: receipts.filter((receipt) => receipt.status === 'skipped').length,
      },
      receipts,
      canon: [
        'Controlled write endpoint only writes eligible adapter previews.',
        'Each successful write stores a dedupe receipt per journal id.',
        'Attestation signatures are attached to ledger payloads.',
        'When quorum_required=true, writes require quorum authority.',
        'This endpoint does not mutate Vault, MIC, Fountain, Canon, or replay state.',
      ],
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
