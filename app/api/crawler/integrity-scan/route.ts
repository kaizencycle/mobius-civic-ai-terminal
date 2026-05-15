import { NextRequest, NextResponse } from 'next/server';
import { requireWriteAuth } from '@/lib/auth/agent-write-auth';
import { auditPublicSource, auditToRawEvent, type SourceAuditPurpose } from '@/lib/crawler/sourceAuditor';
import { currentCycleId } from '@/lib/eve/cycle-engine';

export const dynamic = 'force-dynamic';

const VALID_PURPOSES = new Set<SourceAuditPurpose>([
  'status_integrity_check',
  'documentation_integrity_check',
  'policy_change_check',
  'public_source_check',
]);

function normalizePurpose(value: unknown): SourceAuditPurpose {
  return typeof value === 'string' && VALID_PURPOSES.has(value as SourceAuditPurpose)
    ? (value as SourceAuditPurpose)
    : 'public_source_check';
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    agent: 'HERMES',
    route: '/api/crawler/integrity-scan',
    mode: 'operator_triggered',
    write_auth: 'required_for_post',
    status: 'ready',
    boundary: 'Observation only. EPICON proves the source was observed; it does not prove the underlying claim is true.',
    accepted_purposes: Array.from(VALID_PURPOSES),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  const auth = requireWriteAuth(request);
  if (!auth.ok) {
    return NextResponse.json({
      ok: false,
      agent: 'HERMES',
      action: 'integrity_source_audit',
      result: 'blocked',
      error: auth.code,
      message: auth.code === 'write_auth_not_configured'
        ? 'Write auth is not configured. Set AGENT_SERVICE_TOKEN, CRON_SECRET, or MOBIUS_WRITE_TOKEN.'
        : 'Write auth required for integrity source scans.',
    }, { status: auth.status });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({
      ok: false,
      agent: 'HERMES',
      action: 'integrity_source_audit',
      result: 'invalid_request',
      error: 'invalid_json',
    }, { status: 400 });
  }

  const rawUrl = typeof payload.url === 'string' ? payload.url.trim() : '';
  if (!rawUrl) {
    return NextResponse.json({
      ok: false,
      agent: 'HERMES',
      action: 'integrity_source_audit',
      result: 'invalid_request',
      error: 'missing_url',
    }, { status: 400 });
  }

  const purpose = normalizePurpose(payload.purpose);
  const cycle = typeof payload.cycle === 'string' && payload.cycle.trim().length > 0
    ? payload.cycle.trim()
    : currentCycleId();

  const audit = await auditPublicSource(rawUrl, purpose);
  const epicon_event = auditToRawEvent(audit, cycle);

  return NextResponse.json({
    ok: audit.ok,
    agent: 'HERMES',
    action: 'integrity_source_audit',
    mode: 'operator_triggered',
    cycle,
    audit,
    epicon_ready: Boolean(epicon_event),
    epicon_event,
    pulse_lane: 'integrity_source_auditor',
    reviewers: ['ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA'],
    boundary: 'Observation only. EPICON proves the source was observed; it does not prove the underlying claim is true.',
  }, {
    status: audit.ok ? 200 : 422,
    headers: { 'Cache-Control': 'no-store' },
  });
}
