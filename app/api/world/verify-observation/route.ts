/**
 * POST /api/world/verify-observation
 *
 * C-412 — Thin adapter for World Renderer observation packets.
 * Auth: service secret (CRON_SECRET / MOBIUS_SERVICE_SECRET). Does not persist observations.
 *
 * CC0 Public Domain
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { computeConsensus } from '@/lib/epicon/consensus';
import { composeInstrumentsSnapshot } from '@/lib/instruments/composeInstrumentsSnapshot';
import {
  isObservationAccepted,
  parseObservationReports,
} from '@/lib/instruments/parseObservationReports';
import type { MobiusInstrumentsSnapshot } from '@/lib/instruments/types';
import { getServiceAuthError } from '@/lib/security/serviceAuth';

export const dynamic = 'force-dynamic';

function validateObservationBody(
  body: unknown,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body' };
  }
  const row = body as Record<string, unknown>;
  const hasPacketId = typeof row.packet_id === 'string' && row.packet_id.trim().length > 0;
  const observation = row.observation;
  const hasObservation =
    observation !== null &&
    observation !== undefined &&
    typeof observation === 'object' &&
    !Array.isArray(observation);
  if (!hasPacketId && !hasObservation) {
    return { ok: false, error: 'missing_observation_or_packet_id' };
  }
  return { ok: true, data: row };
}

function extractPacketId(data: Record<string, unknown>): string | null {
  if (typeof data.packet_id === 'string' && data.packet_id.trim()) {
    return data.packet_id.trim();
  }
  const observation = data.observation;
  if (observation && typeof observation === 'object' && !Array.isArray(observation)) {
    const packetId = (observation as Record<string, unknown>).packet_id;
    if (typeof packetId === 'string' && packetId.trim()) {
      return packetId.trim();
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const authError = getServiceAuthError(request);
  if (authError) return authError;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const bodyCheck = validateObservationBody(rawBody);
  if (!bodyCheck.ok) {
    return NextResponse.json({ ok: false, error: bodyCheck.error }, { status: 400 });
  }

  const body = bodyCheck.data;

  if ('reports' in body && body.reports !== undefined && body.reports !== null) {
    const parsed = parseObservationReports(body.reports);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
  }

  const reportsParsed = parseObservationReports(body.reports);
  const reports = reportsParsed.ok ? reportsParsed.reports : [];
  const packetId = extractPacketId(body);

  const consensus = reports.length > 0 ? computeConsensus(reports) : null;
  const accepted = isObservationAccepted(consensus);

  let instruments_snapshot: MobiusInstrumentsSnapshot | null = null;
  let compose_error: string | null = null;
  try {
    instruments_snapshot = await composeInstrumentsSnapshot();
  } catch (error) {
    compose_error = error instanceof Error ? error.message : 'instruments_compose_failed';
  }

  if (!instruments_snapshot) {
    return NextResponse.json(
      {
        ok: false,
        error: compose_error ?? 'instruments_compose_failed',
        accepted: false,
        packet_id: packetId,
        consensus,
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Mobius-Source': 'world-verify-observation',
        },
      },
    );
  }

  const note =
    reports.length > 0
      ? accepted
        ? 'EPICON consensus pass with independent quorum — ephemeral adapter response only (not persisted).'
        : 'EPICON consensus did not reach independent quorum pass — ephemeral adapter response only.'
      : 'Observation received for adapter evaluation — no agent reports supplied; not persisted.';

  return NextResponse.json(
    {
      ok: true,
      accepted,
      persisted: false,
      packet_id: packetId,
      consensus,
      confidence_new: consensus?.ecs ?? null,
      witnesses: reports.map((r) => r.agent),
      custody_chain: reports.map((r) => ({
        agent: r.agent,
        action: r.stance,
        timestamp: r.generated_at,
      })),
      instruments_snapshot,
      observation: body.observation ?? null,
      timestamp: new Date().toISOString(),
      note,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Mobius-Source': 'world-verify-observation',
      },
    },
  );
}
