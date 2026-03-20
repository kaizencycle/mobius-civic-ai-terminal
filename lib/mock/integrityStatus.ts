export type IntegrityStatusResponse = {
  ok: true;
  cycle: string;
  timestamp: string;
  global_integrity: number;
  mii_baseline: number;
  mic_supply: number;
  terminal_status: 'nominal' | 'stressed' | 'critical';
  primary_driver: string;
  summary: string;
  signals: {
    geopolitics: number;
    economy: number;
    sentiment: number;
    information: number;
  };
};

export const integrityStatus: IntegrityStatusResponse = {
  ok: true,
  cycle: 'C-256',
  timestamp: '2026-03-20T11:34:00Z',
  global_integrity: 0.78,
  mii_baseline: 0.5,
  mic_supply: 1000000,
  terminal_status: 'stressed',
  primary_driver: 'Middle East energy instability',
  summary:
    'Global system stable but stressed. Energy markets continue to drive macro uncertainty.',
  signals: {
    geopolitics: 0.65,
    economy: 0.75,
    sentiment: 0.72,
    information: 0.8,
  },
};
