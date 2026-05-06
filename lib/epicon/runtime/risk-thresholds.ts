export const EPICON_RUNTIME_THRESHOLDS = {
  mediumRisk: 0.35,
  highRisk: 0.7,
  largeDiffFiles: 25,
  largeDeletionCount: 200,
} as const;

export const EPICON_SENSITIVE_PATH_PATTERNS = [
  'auth',
  'middleware',
  'secret',
  'token',
  '.env',
  'permissions',
  'vault',
  'ledger',
] as const;
