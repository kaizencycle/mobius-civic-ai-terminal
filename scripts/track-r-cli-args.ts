#!/usr/bin/env tsx
/**
 * Parse shared Track R CLI flags for capture binding and base URL.
 */
import { TRACK_R_DEFAULT_CAPTURE_ID } from '@/lib/watchdog/batchRepair/trackRCaptureV2Governance';

export function parseTrackRCliArgs(argv: string[]): {
  baseUrl?: string;
  captureId?: string;
  skipCasProbe: boolean;
  apply: boolean;
  explicitOperatorCommand: boolean;
} {
  const baseUrlIndex = argv.indexOf('--base-url');
  const captureIdIndex = argv.indexOf('--capture-id');
  return {
    baseUrl:
      baseUrlIndex >= 0 && argv[baseUrlIndex + 1] ? argv[baseUrlIndex + 1] : undefined,
    captureId:
      captureIdIndex >= 0 && argv[captureIdIndex + 1]
        ? argv[captureIdIndex + 1]
        : TRACK_R_DEFAULT_CAPTURE_ID,
    skipCasProbe: argv.includes('--skip-cas-probe'),
    apply: argv.includes('--apply'),
    explicitOperatorCommand: argv.includes('--explicit-operator-command'),
  };
}
