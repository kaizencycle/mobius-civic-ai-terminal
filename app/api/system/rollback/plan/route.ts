import { NextRequest, NextResponse } from 'next/server';
import { buildRollbackPlan, getIncident } from '@/lib/system/incidents';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RollbackPlanBody = {
  incident_id?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RollbackPlanBody;
    const incident = body.incident_id ? await getIncident(body.incident_id) : null;
    if (body.incident_id && !incident) {
      return NextResponse.json({ ok: false, error: 'incident_not_found', incident_id: body.incident_id }, { status: 404 });
    }
    const plan = buildRollbackPlan(incident);
    return NextResponse.json(plan, {
      headers: {
        'Cache-Control': 'no-store',
        'X-Mobius-Source': 'rollback-plan',
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'rollback_plan_failed',
    }, { status: 500 });
  }
}
