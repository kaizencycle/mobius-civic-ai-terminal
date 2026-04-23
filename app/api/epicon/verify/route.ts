import { NextRequest, NextResponse } from 'next/server';
import { getEchoStatus, prependEchoEpicon, prependEchoLedger } from '@/lib/echo/store';
import { getCandidate, verifyCandidate } from '@/lib/epicon/store';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { storeEpicon, type StoredEpicon } from '@/lib/mobius/stores';
import type { EpiconItem, LedgerEntry } from '@/lib/terminal/types';

type VerifyRequest = {
  id: string;
  outcome: 'verified' | 'contradicted';
  confidence_tier: number;
  zeus_note?: string;
};

let promotedCounter = 0;

function nextPromotedEpiconId(): string {
  promotedCounter += 1;
  const cycleId = getEchoStatus().cycleId || currentCycleId();
  const idx = String(promotedCounter).padStart(3, '0');
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  return `EPICON-${cycleId}-EXT-${idx}-${ts}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const mins = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${month}-${day} ${hours}:${mins} UTC`;
}

function toEpiconCategory(category: string): EpiconItem['category'] {
  switch (category) {
    case 'market':
    case 'governance':
    case 'infrastructure':
      return category;
    case 'geopolitical':
    default:
      return 'geopolitical';
  }
}

function buildPromotedEpicon(candidate: NonNullable<ReturnType<typeof getCandidate>>, confidenceTier: number, zeusNote?: string): {
  stored: StoredEpicon;
  feedItem: EpiconItem;
  ledgerEntry: LedgerEntry;
} {
  const now = new Date().toISOString();
  const epiconId = nextPromotedEpiconId();
  const ledgerEntryId = `LE-${epiconId}`;
  const sourceSystem = candidate.external_source_system || 'external';
  const sourceActor = candidate.external_source_actor || 'unknown-actor';
  const category = toEpiconCategory(candidate.category);
  const trace = [
    ...candidate.trace,
    `ZEUS verified external candidate ${candidate.id} as attested signal`,
    `Promotion provenance: ${sourceSystem} / ${sourceActor}`,
    ...(zeusNote ? [`ZEUS note: ${zeusNote}`] : []),
    `Ledger commit prepared as ${ledgerEntryId}`,
  ];

  const stored: StoredEpicon = {
    id: epiconId,
    title: candidate.title,
    summary: candidate.summary,
    category,
    status: 'verified',
    confidenceTier: Math.max(0, Math.min(4, confidenceTier)) as 0 | 1 | 2 | 3 | 4,
    ownerAgent: 'ECHO',
    sources: candidate.sources?.length
      ? candidate.sources
      : [sourceSystem, sourceActor].filter(Boolean),
    tags: candidate.tags ?? [],
    timestamp: now,
    trace,
    verificationOutcome: 'hit',
    zeusNote: zeusNote || null,
    createdAt: now,
  };

  const feedItem: EpiconItem = {
    id: stored.id,
    title: stored.title,
    summary: stored.summary,
    category,
    status: stored.status,
    confidenceTier: stored.confidenceTier as 0 | 1 | 2 | 3 | 4,
    ownerAgent: stored.ownerAgent,
    sources: stored.sources,
    timestamp: formatTimestamp(now),
    trace: stored.trace,
  };

  const ledgerEntry: LedgerEntry = {
    id: ledgerEntryId,
    cycleId: getEchoStatus().cycleId || currentCycleId(),
    type: 'epicon',
    agentOrigin: 'ZEUS',
    timestamp: formatTimestamp(now),
    summary: `${epiconId} committed from external candidate ${candidate.id} via ${sourceSystem}`,
    integrityDelta: 0.01,
    status: 'committed',
  };

  return { stored, feedItem, ledgerEntry };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as VerifyRequest;

  if (!body.id) {
    return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 });
  }

  if (body.outcome !== 'verified' && body.outcome !== 'contradicted') {
    return NextResponse.json({ ok: false, error: 'outcome must be "verified" or "contradicted"' }, { status: 400 });
  }

  const candidate = getCandidate(body.id);
  if (!candidate) {
    return NextResponse.json(
      { ok: false, error: 'Candidate not found' },
      { status: 404 },
    );
  }

  if (candidate.status !== 'pending') {
    return NextResponse.json(
      { ok: false, error: `Candidate already resolved as ${candidate.status}` },
      { status: 409 },
    );
  }

  let promotion: ReturnType<typeof buildPromotedEpicon> | null = null;
  if (body.outcome === 'verified') {
    promotion = buildPromotedEpicon(candidate, body.confidence_tier, body.zeus_note);
    storeEpicon(promotion.stored);
    prependEchoEpicon(promotion.feedItem);
    prependEchoLedger(promotion.ledgerEntry);
  }

  const updated = verifyCandidate({
    id: body.id,
    outcome: body.outcome,
    confidence_tier: body.confidence_tier,
    zeus_note: body.zeus_note,
    promoted_epicon_id: promotion?.stored.id,
    promoted_ledger_entry_id: promotion?.ledgerEntry.id,
  });

  return NextResponse.json({
    ok: true,
    candidate: updated,
    promoted_epicon: promotion?.stored ?? null,
    ledger_entry: promotion?.ledgerEntry ?? null,
  });
}
