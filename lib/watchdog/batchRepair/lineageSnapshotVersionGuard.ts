/**
 * C-404 — Track R lineage CAS v2 version safety.
 *
 * Once execution paths adopt {@link LineageSnapshotV2Input} (see
 * snapshotIdentity.ts) and the v2 execution-witness contract (see
 * executionWitnessHash.ts), every readiness / apply-preflight / commit-guard
 * check must reject an evidence packet that:
 *   - omits a lineage snapshot version,
 *   - presents a v1 snapshot where v2 is required,
 *   - mixes a v1 lineage snapshot with a v2 execution witness (or vice versa),
 *   - binds an execution witness to a lineage snapshot hash other than the
 *     fresh one just computed, or
 *   - declares a version this codebase does not know how to verify.
 *
 * This module is the single place that enumerates supported versions and
 * enforces those five rules, so a new version can only become acceptable by
 * an explicit, reviewed change to {@link SUPPORTED_LINEAGE_SNAPSHOT_VERSIONS}
 * — never implicitly.
 */

export const SUPPORTED_LINEAGE_SNAPSHOT_VERSIONS = ['v2'] as const;

export type SupportedLineageSnapshotVersion = (typeof SUPPORTED_LINEAGE_SNAPSHOT_VERSIONS)[number];

export function isSupportedLineageSnapshotVersion(
  version: string | null | undefined,
): version is SupportedLineageSnapshotVersion {
  return (
    typeof version === 'string' &&
    (SUPPORTED_LINEAGE_SNAPSHOT_VERSIONS as readonly string[]).includes(version)
  );
}

export type LineageSnapshotVersionedEvidence = {
  lineage_snapshot_version: string | null | undefined;
  lineage_snapshot_hash: string | null | undefined;
  execution_witness_lineage_snapshot_version: string | null | undefined;
  execution_witness_lineage_snapshot_hash: string | null | undefined;
};

export type LineageSnapshotVersionCheck = { ok: true } | { ok: false; errors: string[] };

/** Fail-closed version/hash-binding guard — see module doc for the five required rejections. */
export function assertLineageSnapshotVersionAccepted(
  evidence: LineageSnapshotVersionedEvidence,
): LineageSnapshotVersionCheck {
  const errors: string[] = [];

  if (!evidence.lineage_snapshot_version) {
    errors.push(
      'lineage snapshot version missing — execution requires an explicit schema/domain version',
    );
  } else if (!isSupportedLineageSnapshotVersion(evidence.lineage_snapshot_version)) {
    errors.push(`unsupported lineage snapshot version: ${evidence.lineage_snapshot_version}`);
  }

  if (!evidence.execution_witness_lineage_snapshot_version) {
    errors.push('execution witness lineage snapshot version missing');
  } else if (!isSupportedLineageSnapshotVersion(evidence.execution_witness_lineage_snapshot_version)) {
    errors.push(
      `unsupported execution witness lineage snapshot version: ${evidence.execution_witness_lineage_snapshot_version}`,
    );
  }

  if (
    evidence.lineage_snapshot_version &&
    evidence.execution_witness_lineage_snapshot_version &&
    evidence.lineage_snapshot_version !== evidence.execution_witness_lineage_snapshot_version
  ) {
    errors.push(
      `mixed lineage snapshot versions: lineage=${evidence.lineage_snapshot_version} execution_witness=${evidence.execution_witness_lineage_snapshot_version}`,
    );
  }

  if (!evidence.lineage_snapshot_hash || !evidence.execution_witness_lineage_snapshot_hash) {
    errors.push('lineage snapshot hash or execution witness lineage snapshot hash missing');
  } else if (evidence.lineage_snapshot_hash !== evidence.execution_witness_lineage_snapshot_hash) {
    errors.push(
      'execution witness is bound to a different lineage snapshot hash than the fresh lineage snapshot',
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
