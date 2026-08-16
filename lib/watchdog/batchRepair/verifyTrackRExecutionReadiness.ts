import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeFreshLineageSnapshotFromProduction,
  resolveLiveAffectedBlockNumbersForCas,
} from '@/lib/watchdog/batchRepair/computeFreshLineageSnapshotFromProduction';
import {
  resolveTrackRCaptureBinding,
  type TrackRCaptureBinding,
  CAPTURE_2014Z_EXPECTED_HASHES,
  TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION,
} from '@/lib/watchdog/batchRepair/trackRCaptureBinding';
import {
  CAPTURE_0123Z_EXPECTED_HASHES,
  CAPTURE_0123Z_ID,
  verifyTrackRCaptureAttestation,
  type TrackRCaptureAttestationCheck,
} from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';

export const TRACK_R_GOVERNANCE_ATTESTATION_PATH =
  'docs/epicon/cycles/C-403/TRACK_R_GOVERNANCE_ATTESTATION_capture-0123Z.json';

export const TRACK_R_EXPLICIT_EXECUTION_AUTHORIZATION_PATH =
  'docs/epicon/cycles/C-404/C404_EXPLICIT_EXECUTION_AUTHORIZATION.md';

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
  lineage_snapshot_version: string;
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

export const TRACK_R_V2_GOVERNANCE_ATTESTATION_DIR =
  'artifacts/C-404/track-r-lineage-v2';

const V2_GOVERNANCE_HASH_LABELS = [
  'semantic_manifest_hash',
  'lineage_snapshot_hash',
  'execution_witness_hash',
  'rollback_manifest_hash',
] as const;

export function validateV2GovernanceCandidateBinding(args: {
  binding: TrackRCaptureBinding;
}): { ok: boolean; errors: string[]; awaitingFreshAttestation: boolean } {
  const errors: string[] = [];
  if (args.binding.lineage_snapshot_version !== TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION) {
    errors.push('capture binding is not a v2 governance candidate');
    return { ok: false, errors, awaitingFreshAttestation: false };
  }

  for (const label of V2_GOVERNANCE_HASH_LABELS) {
    const expected = CAPTURE_2014Z_EXPECTED_HASHES[label];
    const observed = args.binding.attestation_hashes[label];
    if (observed !== expected) {
      errors.push(`v2 governance candidate hash mismatch for ${label}`);
    }
  }

  const repoRoot = process.cwd();
  const signedMarkers = [
    join(repoRoot, TRACK_R_V2_GOVERNANCE_ATTESTATION_DIR, 'ZEUS_V2_ATTESTATION_SIGNED.md'),
    join(repoRoot, TRACK_R_V2_GOVERNANCE_ATTESTATION_DIR, 'EVE_V2_ATTESTATION_SIGNED.md'),
    join(repoRoot, TRACK_R_V2_GOVERNANCE_ATTESTATION_DIR, 'HUMAN_V2_CONSENT_SIGNED.md'),
  ];
  const awaitingFreshAttestation = !signedMarkers.some((path) => existsSync(path));

  return { ok: errors.length === 0, errors, awaitingFreshAttestation };
}

const EXPLICIT_AUTHORIZATION_HASH_LABELS = [
  'semantic_manifest_hash',
  'lineage_snapshot_hash',
  'execution_witness_hash',
  'rollback_manifest_hash',
] as const;

/** Machine-readable supersession markers in explicit authorization documents. */
export function isExplicitExecutionAuthorizationSuperseded(content: string): boolean {
  return (
    content.includes('SUPERSEDED FOR EXECUTION') ||
    content.includes('SUPERSEDED — NON-EXECUTABLE')
  );
}

export function validateExplicitCaptureAuthorization(args: {
  captureId: string;
  attestationHashes: TrackRCaptureBinding['attestation_hashes'];
  authorizationPath?: string;
  repoRoot?: string;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const authorizationPath =
    args.authorizationPath ??
    join(args.repoRoot ?? process.cwd(), TRACK_R_EXPLICIT_EXECUTION_AUTHORIZATION_PATH);

  if (!existsSync(authorizationPath)) {
    errors.push(`explicit execution authorization missing at ${authorizationPath}`);
    return { ok: false, errors };
  }

  const content = readFileSync(authorizationPath, 'utf8');
  if (isExplicitExecutionAuthorizationSuperseded(content)) {
    errors.push('explicit execution authorization superseded — non-executable');
    return { ok: false, errors };
  }
  if (!content.includes(args.captureId)) {
    errors.push('explicit authorization missing capture_id binding');
  }
  for (const label of EXPLICIT_AUTHORIZATION_HASH_LABELS) {
    const hash = args.attestationHashes[label];
    if (!hash || !content.includes(hash)) {
      errors.push(`explicit authorization missing hash binding for ${label}`);
    }
  }
  if (!content.includes('ATLAS_AUTHORIZED_STEP_6_MUTATION')) {
    errors.push('explicit authorization missing custodian witness signature');
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
  captureId?: string;
  captureBinding?: TrackRCaptureBinding;
}): Promise<TrackRExecutionReadiness> {
  const verifiedAt = args?.verifiedAt ?? new Date().toISOString();
  const baseUrl = (args?.baseUrl ?? 'https://mobius-civic-ai-terminal.vercel.app').replace(/\/$/, '');
  const probeFreshCas = args?.probeFreshCas ?? true;
  const checks: TrackRCaptureAttestationCheck[] = [];

  const binding = args?.captureBinding ?? resolveTrackRCaptureBinding({
    captureId: args?.captureId,
    archivePath: args?.archivePath,
  });
  const archivePath = binding.archive_path;
  const governancePath =
    args?.governancePath ?? join(process.cwd(), TRACK_R_GOVERNANCE_ATTESTATION_PATH);
  const useLegacyGovernance = binding.capture_id === CAPTURE_0123Z_ID;
  const useV2Governance = binding.lineage_snapshot_version === TRACK_R_V2_LINEAGE_SNAPSHOT_VERSION;
  const attestedLineageSnapshotHash = binding.attestation_hashes.lineage_snapshot_hash;

  addCheck(
    checks,
    'lineage_snapshot_version',
    useV2Governance ? 'pass' : binding.lineage_snapshot_version === 'v1' ? 'warn' : 'fail',
    binding.lineage_snapshot_version,
  );

  if (binding.lineage_snapshot_version === 'v1' && !useLegacyGovernance) {
    addCheck(
      checks,
      'lineage_snapshot_version_execution',
      'fail',
      'v1 lineage snapshot bindings are not accepted for new execution attempts',
    );
  }

  let humanConsentValidation: { ok: boolean; errors: string[] } = {
    ok: false,
    errors: ['human approval verdict not recorded'],
  };
  let verdicts: Record<string, { verdict?: string; manifest_field?: string; signed_at?: string; signed_attestation?: string }> =
    {};

  if (useLegacyGovernance) {
    const governance = readJsonIfExists<Record<string, unknown>>(governancePath);
    if (!governance) {
      addCheck(checks, 'governance_attestation', 'fail', `missing or unreadable ${governancePath}`);
      return {
        capture_id: binding.capture_id,
        verified_at: verifiedAt,
        lineage_snapshot_version: binding.lineage_snapshot_version,
        readiness_status: 'blocked',
        execution_authorized: false,
        governance_attestation_path: governancePath,
        attested_lineage_snapshot_hash: attestedLineageSnapshotHash,
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

    verdicts = (governance.governance_verdicts ?? {}) as typeof verdicts;
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
        : JSON.stringify(validateRecordedHumanConsent({ verdict: verdicts.human_approval })),
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

    humanConsentValidation = validateRecordedHumanConsent({
      verdict: verdicts.human_approval,
    });
  } else if (useV2Governance) {
    const v2Governance = validateV2GovernanceCandidateBinding({ binding });
    addCheck(
      checks,
      'governance_attestation',
      'warn',
      `v2 governance candidate ${binding.capture_id} — fresh ZEUS/EVE/human attestation required`,
    );
    addCheck(
      checks,
      'capture_binding_archive',
      existsSync(join(archivePath, 'TRACK_R_LIVE_DRY_RUN_PACKAGE.json')) ||
        existsSync(join(archivePath, 'GITHUB_PROVENANCE.json'))
        ? 'pass'
        : 'fail',
      archivePath,
    );
    addCheck(
      checks,
      'v2_governance_candidate_hashes',
      v2Governance.ok ? 'pass' : 'fail',
      v2Governance.ok ? CAPTURE_2014Z_EXPECTED_HASHES.lineage_snapshot_hash : JSON.stringify(v2Governance.errors),
    );
    addCheck(
      checks,
      'governance_human_consent',
      v2Governance.awaitingFreshAttestation ? 'pass' : 'fail',
      v2Governance.awaitingFreshAttestation
        ? 'awaiting fresh v2 ZEUS/EVE/human attestation'
        : 'v2 attestation markers present — custodian review required',
    );
    humanConsentValidation = {
      ok: !v2Governance.awaitingFreshAttestation && v2Governance.ok,
      errors: v2Governance.awaitingFreshAttestation
        ? ['awaiting fresh v2 ZEUS/EVE/human attestation']
        : v2Governance.errors,
    };
  } else {
    addCheck(
      checks,
      'governance_attestation',
      'warn',
      `explicit capture binding ${binding.capture_id} — C-403 governance JSON not required`,
    );
    addCheck(
      checks,
      'capture_binding_archive',
      existsSync(join(archivePath, 'TRACK_R_LIVE_DRY_RUN_PACKAGE.json')) ? 'pass' : 'fail',
      archivePath,
    );
    addCheck(
      checks,
      'capture_binding_lineage_hash',
      binding.attestation_hashes.lineage_snapshot_hash.length === 64 ? 'pass' : 'fail',
      binding.attestation_hashes.lineage_snapshot_hash,
    );

    const explicitAuthorization = validateExplicitCaptureAuthorization({
      captureId: binding.capture_id,
      attestationHashes: binding.attestation_hashes,
    });
    addCheck(
      checks,
      'explicit_execution_authorization',
      explicitAuthorization.ok ? 'pass' : 'fail',
      explicitAuthorization.ok
        ? TRACK_R_EXPLICIT_EXECUTION_AUTHORIZATION_PATH
        : JSON.stringify(explicitAuthorization.errors),
    );
    addCheck(
      checks,
      'governance_human_consent',
      explicitAuthorization.ok ? 'pass' : 'fail',
      explicitAuthorization.ok
        ? 'explicit custodian authorization recorded'
        : JSON.stringify(explicitAuthorization.errors),
    );
    humanConsentValidation = explicitAuthorization;
  }

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
      captureId: binding.capture_id,
      lineageSnapshotVersion: binding.lineage_snapshot_version,
      attestedLineageSnapshotHash,
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

  let readiness_status: TrackRExecutionReadinessStatus = 'awaiting_human_consent';
  if (hasFail) {
    readiness_status = casDrift ? 'cas_drift' : 'blocked';
  } else if (casDrift) {
    readiness_status = 'cas_drift';
  } else if (humanConsentValidation.ok) {
    readiness_status =
      fresh_cas_match === true ? 'awaiting_execution_handoff' : 'consent_recorded_cas_required';
  } else if (useV2Governance && !hasFail && !casDrift) {
    readiness_status = 'awaiting_human_consent';
  } else if (!isHumanConsentPending(verdicts.human_approval)) {
    readiness_status = 'blocked';
  }

  return {
    capture_id: binding.capture_id,
    verified_at: verifiedAt,
    lineage_snapshot_version: binding.lineage_snapshot_version,
    readiness_status,
    execution_authorized: false,
    governance_attestation_path: governancePath,
    attested_lineage_snapshot_hash: attestedLineageSnapshotHash,
    fresh_lineage_snapshot_hash,
    fresh_cas_match,
    checks,
  };
}
