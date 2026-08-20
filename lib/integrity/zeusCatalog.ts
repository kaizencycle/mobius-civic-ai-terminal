import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VerificationStatusLabel } from '@/lib/mic/quorumSemantics';

export const ZEUS_CATALOG_DIR = 'docs/catalog/zeus' as const;

export type ZeusVerificationReport = {
  timestamp: string;
  agent?: string;
  cycle?: string;
  verification_status?: string;
  gi_verified?: boolean;
  candidates_reviewed?: number;
  candidates_confirmed?: number;
  candidates_contested?: number;
  quorum_attestation_sent?: boolean;
  quorum_status?: string;
  atlas_heartbeat?: string;
  findings?: Array<{ check?: string; result?: string; detail?: string }>;
};

export function normalizeZeusReportTimestamp(filename: string): string | null {
  const stem = filename.replace('-verification.json', '');
  const compact = stem.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`;
  }
  const dashed = stem.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/);
  if (dashed) {
    return `${dashed[1]}-${dashed[2]}-${dashed[3]}T${dashed[4]}:${dashed[5]}:${dashed[6]}Z`;
  }
  return null;
}

function zeusReportTimeMs(filename: string): number {
  const iso = normalizeZeusReportTimestamp(filename);
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function listZeusVerificationReportFilenames(repoRoot = process.cwd()): string[] {
  const dir = join(repoRoot, ZEUS_CATALOG_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('-verification.json'))
    .sort((a, b) => zeusReportTimeMs(b) - zeusReportTimeMs(a));
}

export function loadLatestZeusVerificationReport(repoRoot = process.cwd()): {
  relative_path: string;
  report: ZeusVerificationReport;
} | null {
  const filenames = listZeusVerificationReportFilenames(repoRoot);
  if (filenames.length === 0) return null;
  const relative_path = `${ZEUS_CATALOG_DIR}/${filenames[0]}`;
  const report = JSON.parse(readFileSync(join(repoRoot, relative_path), 'utf8')) as ZeusVerificationReport;
  return { relative_path, report };
}

export function mapZeusVerificationStatus(raw: string | undefined): VerificationStatusLabel {
  if (raw === 'confirmed' || raw === 'verified') return 'verified';
  if (raw === 'disputed') return 'disputed';
  if (raw === 'blocked') return 'blocked';
  return 'unknown';
}

export function zeusGovernanceStateFromReport(
  report: ZeusVerificationReport | null | undefined,
): 'clear' | 'disputed' | 'pending' | 'unknown' {
  const status = mapZeusVerificationStatus(report?.verification_status);
  if (status === 'disputed' || status === 'blocked') return 'disputed';
  if (status === 'verified') return 'clear';
  return 'unknown';
}
