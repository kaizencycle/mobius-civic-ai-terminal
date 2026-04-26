import { NextRequest, NextResponse } from 'next/server';
import { reportIncident } from '@/lib/system/incidents';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ReportBody = {
  severity?: 'low' | 'medium' | 'high' | 'critical';
  affected?: string[];
  trigger?: string;
  evidence?: string[];
  fallback?: string;
  source?: string;
  rollback_recommendation?: 'none' | 'fallback' | 'revert_pr' | 'redeploy_previous' | 'operator_review';
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ReportBody;
    const incident = await reportIncident(body ?? {});
    return NextResponse.json({
      ok: true,
      incident,
      canon: 'Incident recorded. Rollback planning may recommend action, but execution remains operator-controlled.',
    }, {
      status: 201,
      headers: {
        'Cache-Control': 'no-store',
        'X-Mobius-Source': 'incident-report',
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'incident_report_failed',
    }, { status: 500 });
  }
}
