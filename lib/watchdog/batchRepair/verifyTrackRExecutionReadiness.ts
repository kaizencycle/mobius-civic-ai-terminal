import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeFreshLineageSnapshotFromProduction,
  resolveLiveAffectedBlockNumbersForCas,
} from '@/lib/watchdog/batchRepair/computeFreshLineageSnapshotFromProduction';
import {
  CAPTURE_0123Z_EXPECTED_HASHES,
  CAPTURE_0123Z_ID,
  verifyTrackRCaptureAttestation,
  type TrackRCaptureAttestationCheck,
} from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';

export const TRACK_R_GOVERNANCE_ATTESTATION_PATH =
  'docs/epicon/cycles/C-403/TRACK_R_GOVERNANCE_ATTESTATION_capture-0123Z.json';

export const TRACK_R_IMMUTABLE_ARCHIVE =
  'artifacts/C-403/track-r-live-dry-run/history/capture-0123Z';

export type TrackRExecutionReadinessStatus =
  | 'awaiting_human_consent'
  | 'consent_recorded_cas_required'
  | 'awaiting_execution_handoff'
  | 'cas_drift'
  | 'blocked';

export type TrackRExecutionReadiness = {
  capture_id: string;
  verified_at: string;
  readiness_status: TrackRExecutionReadinessStatus;
  execution_authorized: false;
  governance_attestation_path: string;
  attested_lineage_snapshot_hash: string;
  fresh_lineage_snapshot_hash: string | null;
  fresh_cas_match: boolean | null;
  checks: TrackRCaptureAttestationCheck[];
};

export { resolveLiveAffectedBlockNumbersForCas };

function isHumanConsentPending(
  verdict: { verdict?: string; manifest_field?: string } | undefined,
): boolean {
  return verdict?.verdict === 'pending' && verdict?.manifest_field === 'pending';
}

function isHumanConsentRecorded(
  verdict: { verdict?: string; manifest_field?: string } | undefined,
): boolean {
  return (
    verdict?.manifest_field === 'approved' &&
    (verdict?.verdict === 'CONSENT' || verdict?.verdict === 'approved')
  );
}

const CONSENT_HASH_BINDING_LABELS = [
  'semantic_manifest_hash',
  'lineage_snapshot_hash',
  'execution_witness_hash',
  'rollback_manifest_hash',
  'production_kv_identity_receipt_hash',
  'production_witness_seal_hash_pin_hash',
] as const;

export function validateRecordedHumanConsent(args: {
  verdict:
    | {
        verdict?: string;
        manifest_field?: string;
        signed_at?: string;
        signed_attestation?: string;
      }
    | undefined;
  repoRoot?: string;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isHumanConsentRecorded(args.verdict)) {
    return { ok: false, errors: ['human approval verdict not recorded'] };
  }
  if (!args.verdict?.signed_at) {
    errors.push('human approval signed_at missing');
  }
  if (!args.verdict?.signed_attestation) {
    errors.push('human approval signed_attestation missing');
  }

  const attestationPath = join(
    args.repoRoot ?? process.cwd(),
    args.verdict?.signed_attestation ?? '',
  );
  if (!args.verdict?.signed_attestation || !existsSync(attestationPath)) {
    errors.push(`signed attestation missing at ${attestationPath}`);
    return { ok: false, errors };
  }

  const content = readFileSync(attestationPath, 'utf8');
  if (!content.includes(CAPTURE_0123Z_ID)) {
    errors.push('signed attestation missing capture_id binding');
  }
  for (const label of CONSENT_HASH_BINDING_LABELS) {
    const hash = CAPTURE_0123Z_EXPECTED_HASHES[label];
    if (!content.includes(hash)) {
      errors.push(`signed attestation missing hash binding for ${label}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function readJsonIfExists<T = Record<string, unknown>>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function addCheck(
  checks: TrackRCaptureAttestationCheck[],
  check: string,
  result: TrackRCaptureAttestationCheck['result'],
  detail: string,
): void {
  checks.push({ check, result, detail });
}

export async function verifyTrackRExecutionReadiness(args?: {
  archivePath?: string;
  governancePath?: string;
  verifiedAt?: string;
  baseUrl?: string;
  probeFreshCas?: boolean;
}): Promise<TrackRExecutionReadiness> {
  const archivePath = args?.archivePath ?? join(process.cwd(), TRACK_R_IMMUTABLE_ARCHIVE);
  const governancePath = args?.governancePath ?? join(process.cwd(), TRACK_R_GOVERNANCE_ATTESTATION_PATH);
  const verifiedAt = args?.verifiedAt ?? new Date().toISOString();
  const baseUrl = (args?.baseUrl ?? 'https://mobius-civic-ai-terminal.vercel.app').replace(/\/$/, '');
  const probeFreshCas = args?.probeFreshCas ?? true;
  const checks: TrackRCaptureAttestationCheck[] = [];

  const governance = readJsonIfExists<Record<string, unknown>>(governancePath);
  if (!governance) {
    addCheck(checks, 'governance_attestation', 'fail', `missing or unreadable ${governancePath}`);
    return {
      capture_id: CAPTURE_0123Z_ID,
      verified_at: verifiedAt,
      readiness_status: 'blocked',
      execution_authorized: false,
      governance_attestation_path: governancePath,
      attested_lineage_snapshot_hash: CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash,
      fresh_lineage_snapshot_hash: null,
      fresh_cas_match: null,
      checks,
    };
  }

  addCheck(
    checks,
    'governance_capture_id',
    governance.capture_id === CAPTURE_0123Z_ID ? 'pass' : 'fail',
    String(governance.capture_id ?? 'missing'),
  );

  const verdicts = (governance.governance_verdicts ?? {}) as Record<
    string,
    { verdict?: string; manifest_field?: string }
  >;
  addCheck(
    checks,
    'governance_zeus_adopt',
    verdicts.zeus?.verdict === 'ADOPT' && verdicts.zeus?.manifest_field === 'approved'
      ? 'pass'
      : 'fail',
    JSON.stringify(verdicts.zeus ?? {}),
  );
  addCheck(
    checks,
    'governance_eve_adopt',
    verdicts.eve?.verdict === 'ADOPT' && verdicts.eve?.manifest_field === 'approved'
      ? 'pass'
      : 'fail',
    JSON.stringify(verdicts.eve ?? {}),
  );
  addCheck(
    checks,
    'governance_human_consent',
    isHumanConsentPending(verdicts.human_approval)
      ? 'pass'
      : validateRecordedHumanConsent({ verdict: verdicts.human_approval }).ok
        ? 'pass'
        : 'fail',
    isHumanConsentPending(verdicts.human_approval)
      ? JSON.stringify(verdicts.human_approval ?? {})
      : JSON.stringify(
          validateRecordedHumanConsent({ verdict: verdicts.human_approval }),
        ),
  );
  addCheck(
    checks,
    'governance_execution_authorized',
    governance.execution_authorized === false ? 'pass' : 'fail',
    String(governance.execution_authorized ?? 'missing'),
  );

  const attestation = verifyTrackRCaptureAttestation({ archivePath, verifiedAt });
  for (const row of attestation.checks) {
    checks.push({
      check: `attestation:${row.check}`,
      result: row.result,
      detail: row.detail,
    });
  }
  addCheck(
    checks,
    'attestation_summary',
    attestation.verification_status === 'adopt_ready' ? 'pass' : 'fail',
    attestation.verification_status,
  );

  let fresh_lineage_snapshot_hash: string | null = null;
  let fresh_cas_match: boolean | null = null;

  if (!probeFreshCas) {
    addCheck(checks, 'fresh_cas_probe', 'warn', 'skipped by caller');
  } else {
    const casProbe = await computeFreshLineageSnapshotFromProduction({
      verifiedAt,
      baseUrl,
      environment: 'production-execution-readiness-probe',
      checkPrefix: 'fresh',
    });
    for (const row of casProbe.checks) {
      checks.push(row);
    }
    fresh_lineage_snapshot_hash = casProbe.fresh_lineage_snapshot_hash;
    fresh_cas_match = casProbe.fresh_cas_match;
  }

  const hasFail = checks.some((row) => row.result === 'fail');
  const casDrift =
    fresh_cas_match === false ||
    checks.some((row) => row.check === 'fresh_lineage_snapshot_cas' && row.result === 'fail');

  const humanConsentValidation = validateRecordedHumanConsent({
    verdict: verdicts.human_approval,
  });

  let readiness_status: TrackRExecutionReadinessStatus = 'awaiting_human_consent';
  if (hasFail) {
    readiness_status = casDrift ? 'cas_drift' : 'blocked';
  } else if (casDrift) {
    readiness_status = 'cas_drift';
  } else if (humanConsentValidation.ok) {
    readiness_status =
      fresh_cas_match === true ? 'awaiting_execution_handoff' : 'consent_recorded_cas_required';
  } else if (!isHumanConsentPending(verdicts.human_approval)) {
    readiness_status = 'blocked';
  }

  return {
    capture_id: CAPTURE_0123Z_ID,
    verified_at: verifiedAt,
    readiness_status,
    execution_authorized: false,
    governance_attestation_path: governancePath,
    attested_lineage_snapshot_hash: CAPTURE_0123Z_EXPECTED_HASHES.lineage_snapshot_hash,
    fresh_lineage_snapshot_hash,
    fresh_cas_match,
    checks,
  };
}
