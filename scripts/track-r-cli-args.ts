#!/usr/bin/env tsx
/**
 * Parse shared Track R CLI flags for capture binding and base URL.
 */
export function parseTrackRCliArgs(argv: string[]): {
  baseUrl?: string;
  captureId?: string;
  skipCasProbe: boolean;
} {
  const baseUrlIndex = argv.indexOf('--base-url');
  const captureIdIndex = argv.indexOf('--capture-id');
  return {
    baseUrl:
      baseUrlIndex >= 0 && argv[baseUrlIndex + 1] ? argv[baseUrlIndex + 1] : undefined,
    captureId:
      captureIdIndex >= 0 && argv[captureIdIndex + 1] ? argv[captureIdIndex + 1] : undefined,
    skipCasProbe: argv.includes('--skip-cas-probe'),
  };
}
