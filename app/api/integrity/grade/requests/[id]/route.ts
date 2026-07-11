/**
 * GET /api/integrity/grade/requests/[id]
 *
 * C-369 proposal-only Integrity Grade request detail.
 */

import { NextResponse } from 'next/server';

import { getIntegrityGradeRequest } from '@/lib/mfs/integrity-grade/store';
import { toPublicIntegrityGradeRequest } from '@/lib/mfs/integrity-grade/sanitize';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
  }

  const stored = getIntegrityGradeRequest(decodeURIComponent(id));
  if (!stored) {
    return NextResponse.json({ ok: false, error: 'Integrity Grade request not found' }, { status: 404 });
  }

  return NextResponse.json(toPublicIntegrityGradeRequest(stored));
}
