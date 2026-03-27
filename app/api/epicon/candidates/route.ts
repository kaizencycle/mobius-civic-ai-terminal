import { createHash, randomBytes } from 'crypto';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { ClaudeSynthesisJson } from '@/lib/eve/synthesize-claude';
import {
  addEveSynthesisCandidate,
  getEveSynthesisCandidates,
  type EveSynthesisCandidate,
} from '@/lib/epicon/eveSynthesisCandidates';
import { getCandidates as getExternalCandidates } from '@/lib/epicon/store';

export const dynamic = 'force-dynamic';

function normalizeCycleId(raw: string): string {
  const t = raw.trim();
  if (/^C-\d+$/i.test(t)) return t.toUpperCase();
  return t;
}

function makeCandidateId(cycleId: string): string {
  const hash = createHash('sha256')
    .update(`${Date.now()}-${randomBytes(8).toString('hex')}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  const c = normalizeCycleId(cycleId);
  return `EPICON-${c}-EVE-SYN-${hash}`;
}

function isSynthesisShape(o: unknown): o is ClaudeSynthesisJson {
  if (o === null || typeof o !== 'object') return false;
  const r = o as Record<string, unknown>;
  return (
    typeof r.epiconTitle === 'string' &&
    typeof r.epiconSummary === 'string' &&
    typeof r.synthesis === 'string'
  );
}

type SynthesizePostBody = {
  ok?: boolean;
  cycleId?: string;
  synthesis?: unknown;
  agent?: string;
  itemCount?: number;
};

export async function GET() {
  const external = getExternalCandidates();
  const eve = getEveSynthesisCandidates();
  const candidates = [...eve, ...external];
  return NextResponse.json({
    ok: true,
    candidates,
    count: candidates.length,
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body === null || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Body must be an object' }, { status: 400 });
  }

  const b = body as SynthesizePostBody & Record<string, unknown>;

  let synth: unknown = b.synthesis;
  if (synth === undefined && isSynthesisShape(body)) {
    synth = body;
  }

  if (!isSynthesisShape(synth)) {
    return NextResponse.json(
      { ok: false, error: 'Expected synthesis object from /api/eve/synthesize' },
      { status: 400 },
    );
  }

  const cycleRaw =
    typeof b.cycleId === 'string' && b.cycleId.trim()
      ? b.cycleId
      : typeof (b as { cycle_id?: string }).cycle_id === 'string'
        ? (b as { cycle_id: string }).cycle_id
        : 'C-0';

  const candidate: EveSynthesisCandidate = {
    id: makeCandidateId(cycleRaw),
    cycleId: normalizeCycleId(cycleRaw),
    timestamp: new Date().toISOString(),
    source: 'eve-synthesis',
    status: 'pending-verification',
    title: synth.epiconTitle,
    summary: synth.epiconSummary,
    dominantTheme: synth.dominantTheme,
    dominantRegion: synth.dominantRegion,
    patternType: synth.patternType,
    confidenceTier: synth.confidenceTier,
    severity: synth.severity,
    flags: synth.flags,
    fullSynthesis: synth.synthesis,
    agentOrigin: 'EVE',
    verifiedBy: null,
    verifiedAt: null,
  };

  addEveSynthesisCandidate(candidate);

  return NextResponse.json({
    ok: true,
    candidate,
  });
}
