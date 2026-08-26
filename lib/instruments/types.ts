/** C-412 — World Renderer composed instruments facade (MOBIUS_INSTRUMENTS_1). */

export const MOBIUS_INSTRUMENTS_SCHEMA_VERSION = 'MOBIUS_INSTRUMENTS_1' as const;

export type InstrumentsAlertSeverity = 'info' | 'warning' | 'critical';

export type InstrumentsAlert = {
  severity: InstrumentsAlertSeverity;
  message: string;
  context?: string;
  timestamp?: string;
};

export type InstrumentsGiBlock = {
  score: number | null;
  provenance: string | null;
  verified: boolean | null;
  conflict: boolean | null;
  floored: boolean | null;
  source: string | null;
  mode: string | null;
};

export type InstrumentsCycleBlock = {
  id: string;
  execution_authorized: boolean;
};

export type InstrumentsMicBlock = {
  readiness_source: string | null;
  supply: number | null;
  supply_source: string | null;
};

export type InstrumentsMicroItem = {
  id: string;
  agent: string;
  label: string;
  score: number;
  source: string;
  latencyMs?: number;
};

export type InstrumentsAgentComposite = {
  agent: string;
  score: number;
  errorCount: number;
  weight: number;
};

export type InstrumentsInstrumentBlock = {
  count: number | null;
  errors: number | null;
  fallbacks_used: number | null;
  failed: { id: string; agent: string; error: string }[];
  items: InstrumentsMicroItem[];
  cached: boolean;
  degraded: boolean;
};

export type InstrumentsKvBlock = {
  continuity_ok: boolean | null;
  diagnostic_ok: boolean | null;
};

export type MobiusInstrumentsSnapshot = {
  schema_version: typeof MOBIUS_INSTRUMENTS_SCHEMA_VERSION;
  timestamp: string;
  ok: boolean;
  degraded: boolean;
  gi: InstrumentsGiBlock;
  cycle: InstrumentsCycleBlock;
  mic: InstrumentsMicBlock;
  instruments: InstrumentsInstrumentBlock;
  agents: InstrumentsAgentComposite[];
  lanes: Record<string, unknown> | null;
  kv: InstrumentsKvBlock;
  alerts: InstrumentsAlert[];
};
