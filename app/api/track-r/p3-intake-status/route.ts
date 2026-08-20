import { NextRequest, NextResponse } from 'next/server';
import { buildTrackRP3IntakeObservability } from '@/lib/trackR/p3IntakeObservability';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('run_id')?.trim() || undefined;
  const status = await buildTrackRP3IntakeObservability({ workflowRunId: runId });

  return NextResponse.json(status, {
    status: status.ok ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'track-r-p3-intake-status',
    },
  });
}
