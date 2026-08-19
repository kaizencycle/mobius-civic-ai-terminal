import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getEveSynthesisAuthError } from '@/lib/security/serviceAuth';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import { runTrackRP3GovernanceIntakeCron } from '@/lib/watchdog/batchRepair/runTrackRP3GovernanceIntakeCron';

export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  const authErr = getEveSynthesisAuthError(req);
  if (authErr) return authErr;

  const cycle = await resolveOperatorCycleId().catch(() => 'C-408');
  const result = await runTrackRP3GovernanceIntakeCron({ cycle });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: result.status,
        errors: result.errors,
        execution_authorized: false,
        production_mutation_performed: false,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    workflow_run_id: result.intake.candidate.workflow_run_id,
    packet_hash: result.intake.candidate.packet_hash,
    journal_id: result.intake.candidate.journal_id,
    observed_production_commit: result.intake.candidate.observed_production_commit,
    zeus_identity_digest: result.zeus_identity_digest,
    eve_identity_digest: result.eve_identity_digest,
    zeus_review_artifact_path: result.zeus_review_artifact_path,
    eve_review_artifact_path: result.eve_review_artifact_path,
    historical_packets: result.intake.historicalPackets,
    execution_authorized: false,
    production_mutation_performed: false,
    review_does_not_authorize_execution: true,
    idempotent: result.idempotent,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
