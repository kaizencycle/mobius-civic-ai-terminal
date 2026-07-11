/**
 * GET/POST /api/integrity/grade/requests
 *
 * C-369 proposal-only Integrity Grade requests. No MIC minting or sealing.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  IntegrityGradeRequestError,
  createIntegrityGradeRequest,
} from '@/lib/mfs/integrity-grade/create-request';
import { listIntegrityGradeRequests } from '@/lib/mfs/integrity-grade/store';
import { toPublicIntegrityGradeRequest } from '@/lib/mfs/integrity-grade/sanitize';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CreateBody = {
  wallet_id?: string;
  portfolio_id?: string;
  portfolio_root_hash?: string;
  consent_granted?: boolean;
};

export async function GET() {
  const requests = listIntegrityGradeRequests().map((entry) => toPublicIntegrityGradeRequest(entry));
  return NextResponse.json({
    ok: true,
    proposal_only: true,
    minting_enabled: false,
    requests,
    count: requests.length,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBody;
    const walletId = typeof body.wallet_id === 'string' ? body.wallet_id.trim() : '';
    const portfolioRootHash =
      typeof body.portfolio_root_hash === 'string' ? body.portfolio_root_hash.trim() : '';
    const consentGranted = body.consent_granted === true;
    const portfolioId =
      typeof body.portfolio_id === 'string' && body.portfolio_id.trim()
        ? body.portfolio_id.trim()
        : undefined;

    if (!walletId) {
      return NextResponse.json({ ok: false, error: 'wallet_id is required' }, { status: 400 });
    }

    if (!portfolioRootHash) {
      return NextResponse.json({ ok: false, error: 'portfolio_root_hash is required' }, { status: 400 });
    }

    const stored = await createIntegrityGradeRequest({
      wallet_id: walletId,
      portfolio_id: portfolioId,
      portfolio_root_hash: portfolioRootHash,
      consent_granted: consentGranted,
    });

    return NextResponse.json(toPublicIntegrityGradeRequest(stored), {
      status: 201,
      headers: {
        'X-Mobius-Source': 'integrity-grade-proposal-c369',
      },
    });
  } catch (error) {
    if (error instanceof IntegrityGradeRequestError) {
      const status =
        error.code === 'consent_required' || error.code === 'invalid_hash' ? 400 : 409;
      return NextResponse.json(
        { ok: false, proposal_only: true, minting_enabled: false, error: error.message, code: error.code },
        { status },
      );
    }

    console.error('[integrity/grade/requests] error', error);
    return NextResponse.json(
      {
        ok: false,
        proposal_only: true,
        minting_enabled: false,
        error: error instanceof Error ? error.message : 'Unable to create Integrity Grade request',
      },
      { status: 500 },
    );
  }
}
