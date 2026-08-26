/**
 * POST /api/world/verify-observation
 *
 * C-412 — Thin adapter for World Renderer observation packets.
 * Auth: service secret (CRON_SECRET / MOBIUS_SERVICE_SECRET). Does not run inline sentinel swarm.
 *
 * CC0 Public Domain
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { computeConsensus } from '@/lib/epicon/consensus';
import type { EpiconAgentReport } from '@/lib/epicon/types';
import { composeInstrumentsSnapshot } from '@/lib/instruments/composeInstrumentsSnapshot';
import { getServiceAuthError } from '@/lib/security/serviceAuth';

export const dynamic = 'force-dynamic';

function parseReports(raw: unknown): EpiconAgentReport[] | null {
  if (!Array.isArray(raw)) return null;
  const reports: EpiconAgentReport[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    if (typeof row.agent !== 'string' || typeof row.stance !== 'string') return null;
    if (!row.ej || typeof row.ej !== 'object') return null;
    reports.push(item as EpiconAgentReport);
  }
  return reports;
}

export async function POST(request: NextRequest) {
  const authError = getServiceAuthError(request);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const reports = parseReports(body.reports);
  const packetId =
    (typeof body.packet_id === 'string' && body.packet_id) ||
    (body.observation &&
      typeof body.observation === 'object' &&
      typeof (body.observation as Record<string, unknown>).packet_id === 'string' &&
      ((body.observation as Record<string, unknown>).packet_id as string)) ||
    null;

  const consensus = reports && reports.length > 0 ? computeConsensus(reports) : null;
  const baseUrl = new URL(request.url).origin;
  const instruments_snapshot = await composeInstrumentsSnapshot(baseUrl);

  const accepted = consensus?.status === 'pass';

  return NextResponse.json(
    {
      ok: true,
      accepted,
      packet_id: packetId,
      consensus,
      confidence_new: consensus?.ecs ?? null,
      witnesses: reports?.map((r) => r.agent) ?? [],
      custody_chain: reports
        ? reports.map((r) => ({
            agent: r.agent,
            action: r.stance,
            timestamp: r.generated_at,
          }))
        : [],
      instruments_snapshot,
      observation: body.observation ?? null,
      timestamp: new Date().toISOString(),
      note:
        reports && reports.length > 0
          ? 'EPICON consensus computed from supplied agent reports.'
          : 'No agent reports supplied; observation recorded without consensus pass.',
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Mobius-Source': 'world-verify-observation',
      },
    },
  );
}
