/**
 * POST /api/vault/block/attest
 *
 * Operator back-attestation endpoint for quarantined reserve seals.
 * Submits a verdict (pass|flag|reject) from a sentinel agent on a stored seal.
 * On VAULT_QUORUM_MIN_PASSES (4) pass votes including ZEUS:
 *   quarantined → attested, substrate attestation attempted, joins canonical chain.
 *
 * Auth: AGENT_SERVICE_TOKEN, CRON_SECRET, or MOBIUS_SERVICE_SECRET bearer token.
 * No cryptographic AttestationSignature required — this is operator-level access.
 *
 * GET /api/vault/block/attest?seal_id=seal-C-294-001
 *   Returns current attestation state for a seal without writing.
 *
 * GET /api/vault/block/attest?block_number=4
 *   Resolves by 1-based position in the full audit index.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import {
  backAttestSeal,
  buildBackAttestRationale,
} from '@/lib/vault-v2/back-attest';
import { getSeal, listAllSealIds } from '@/lib/vault-v2/store';
import type { SentinelAgent, Verdict } from '@/lib/vault-v2/types';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { VAULT_QUORUM_MIN_PASSES } from '@/lib/vault-v2/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isAuthorized(req: NextRequest): boolean {
  const h = req.headers.get('authorization');
  const service = process.env.AGENT_SERVICE_TOKEN ?? '';
  const cron = process.env.CRON_SECRET ?? '';
  const mobius = process.env.MOBIUS_SERVICE_SECRET ?? '';
  if (!service && !cron && !mobius) return true; // open in dev when no tokens configured
  return (
    (service !== '' && bearerMatchesToken(h, service)) ||
    (cron !== '' && bearerMatchesToken(h, cron)) ||
    (mobius !== '' && bearerMatchesToken(h, mobius))
  );
}

async function resolveSealId(sealId?: string, blockNumber?: number): Promise<string | null> {
  if (sealId) return sealId;
  if (blockNumber == null || !Number.isFinite(blockNumber)) return null;
  const ids = await listAllSealIds();
  if (blockNumber < 1 || blockNumber > ids.length) return null;
  return ids[blockNumber - 1] ?? null;
}

// ── GET — read attestation state ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sealId = url.searchParams.get('seal_id') ?? undefined;
  const rawBlock = url.searchParams.get('block_number');
  const blockNumber = rawBlock ? parseInt(rawBlock, 10) : undefined;

  const resolvedId = await resolveSealId(sealId, blockNumber);
  if (!resolvedId) {
    return NextResponse.json(
      { ok: false, error: 'Provide seal_id or block_number' },
      { status: 400 },
    );
  }

  const seal = await getSeal(resolvedId);
  if (!seal) {
    return NextResponse.json(
      { ok: false, error: `Seal not found: ${resolvedId}` },
      { status: 404 },
    );
  }

  const voted = SENTINEL_AGENTS.filter((a) => Boolean(seal.attestations[a]));
  const pending = SENTINEL_AGENTS.filter((a) => !seal.attestations[a]);
  const passCount = SENTINEL_AGENTS.filter(
    (a) => seal.attestations[a]?.verdict === 'pass',
  ).length;

  return NextResponse.json({
    ok: true,
    seal_id: resolvedId,
    sequence: seal.sequence,
    cycle_at_seal: seal.cycle_at_seal,
    status: seal.status,
    substrate_attestation_id: seal.substrate_attestation_id ?? null,
    attestations: seal.attestations,
    quorum: {
      pass_count: passCount,
      needed: VAULT_QUORUM_MIN_PASSES,
      agents_voted: voted,
      agents_pending: pending,
      reached: seal.status === 'attested',
    },
  });
}

// ── POST — submit a back-attestation vote ────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const sealId = typeof body.seal_id === 'string' ? body.seal_id : undefined;
  const blockNumber =
    typeof body.block_number === 'number' && Number.isFinite(body.block_number)
      ? body.block_number
      : undefined;
  const agentRaw = typeof body.agent === 'string' ? body.agent.toUpperCase() : '';
  const verdictRaw = typeof body.verdict === 'string' ? body.verdict : '';
  const rationale = typeof body.rationale === 'string' ? body.rationale.trim() : '';
  const posture =
    typeof body.posture === 'string' &&
    ['confident', 'cautionary', 'stressed', 'degraded'].includes(body.posture)
      ? (body.posture as 'confident' | 'cautionary' | 'stressed' | 'degraded')
      : undefined;

  const agent = agentRaw as SentinelAgent;
  if (!SENTINEL_AGENTS.includes(agent)) {
    return NextResponse.json(
      { ok: false, error: `agent must be one of: ${SENTINEL_AGENTS.join(', ')}` },
      { status: 400 },
    );
  }

  if (!['pass', 'flag', 'reject'].includes(verdictRaw)) {
    return NextResponse.json(
      { ok: false, error: 'verdict must be pass|flag|reject' },
      { status: 400 },
    );
  }
  const verdict = verdictRaw as Verdict;

  const resolvedId = await resolveSealId(sealId, blockNumber);
  if (!resolvedId) {
    return NextResponse.json(
      { ok: false, error: 'Provide seal_id or valid block_number' },
      { status: 400 },
    );
  }

  const result = await backAttestSeal({
    seal_id: resolvedId,
    agent,
    verdict,
    rationale: rationale || buildBackAttestRationale(agent, resolvedId),
    posture,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
