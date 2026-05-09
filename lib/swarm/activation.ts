// C-306 PR-512: Agent activation conditions for the swarm cron.
// Each entry defines when an agent fires and at which LLM tier (1=Haiku, 2=Sonnet, 3=Opus).

import type { SwarmBusState } from './bus';

export interface SwarmSignals {
  gi: number;                 // global integrity composite 0-1
  errors: number;             // instrument error count from /api/signals/micro
  instrumentCount: number;    // total instruments polled
  fallbacksUsed: number;      // instruments that fell back to secondary URL
  tripwireActive: boolean;    // true when trust tripwire is elevated or critical
  cycleId: string;
}

export interface ActivationCondition {
  agentId: string;
  shouldActivate(signals: SwarmSignals, state: SwarmBusState): boolean;
  tier(signals: SwarmSignals, state: SwarmBusState): 1 | 2 | 3;
}

export const ACTIVATION_CONDITIONS: Record<string, ActivationCondition> = {
  ATLAS: {
    agentId: 'ATLAS',
    shouldActivate(signals) {
      // Always runs — system integrity sentinel; skip only if GI is very healthy
      return signals.gi < 0.92;
    },
    tier(signals) {
      return signals.gi < 0.55 || signals.tripwireActive ? 2 : 1;
    },
  },

  ZEUS: {
    agentId: 'ZEUS',
    shouldActivate(signals) {
      // Verification fires when signal quality degrades
      const errorRate = signals.errors / Math.max(signals.instrumentCount, 1);
      return errorRate > 0.15 || signals.gi < 0.70;
    },
    tier(signals) {
      return signals.gi < 0.45 ? 3 : 2;
    },
  },

  ECHO: {
    agentId: 'ECHO',
    shouldActivate(signals) {
      // Intake fires when fallbacks are high — indicates degraded primary data
      const fallbackRate = signals.fallbacksUsed / Math.max(signals.instrumentCount, 1);
      return fallbackRate > 0.20 || signals.gi < 0.80;
    },
    tier() { return 1; },
  },

  AUREA: {
    agentId: 'AUREA',
    shouldActivate(signals) {
      // Civic/economic synthesis — fires on material GI movement
      return signals.gi < 0.75 || signals.gi > 0.95;
    },
    tier() { return 2; },
  },

  JADE: {
    agentId: 'JADE',
    shouldActivate(signals) {
      // Memory / canon — fires when GI is notably low (risk of canon drift)
      return signals.gi < 0.60;
    },
    tier() { return 2; },
  },

  HERMES: {
    agentId: 'HERMES',
    shouldActivate(signals) {
      // Narrative velocity — fires when info instruments are degraded
      return signals.gi < 0.80;
    },
    tier() { return 1; },
  },

  DAEDALUS: {
    agentId: 'DAEDALUS',
    shouldActivate(signals) {
      // Infrastructure — fires when error count is elevated
      const errorRate = signals.errors / Math.max(signals.instrumentCount, 1);
      return errorRate > 0.25 || signals.tripwireActive;
    },
    tier(signals) {
      return signals.tripwireActive ? 2 : 1;
    },
  },

  EVE: {
    agentId: 'EVE',
    shouldActivate(signals) {
      // Cycle observer — fires on significant GI drift in either direction
      return signals.gi < 0.65 || signals.gi > 0.97;
    },
    tier() { return 2; },
  },

  URIEL: {
    agentId: 'URIEL',
    shouldActivate(signals) {
      // Adversarial reasoning — fires on anomaly spikes or external threat signals
      const errorRate = signals.errors / Math.max(signals.instrumentCount, 1);
      return errorRate > 0.30 || signals.tripwireActive;
    },
    tier(signals) {
      return signals.tripwireActive ? 3 : 2;
    },
  },

  ZENITH: {
    agentId: 'ZENITH',
    shouldActivate(_signals, state) {
      // Alternate-model crosscheck — fires when ATLAS and ZEUS confidence diverge
      const atlasConf = (state.ATLAS?.result as Record<string, unknown> | undefined)?.confidence;
      const zeusConf  = (state.ZEUS?.result  as Record<string, unknown> | undefined)?.confidence;
      const atlas = typeof atlasConf === 'number' ? atlasConf : null;
      const zeus  = typeof zeusConf  === 'number' ? zeusConf  : null;
      if (atlas == null || zeus == null) return false;
      return Math.abs(atlas - zeus) > 0.25;
    },
    tier() { return 2; },
  },
};

export const AGENT_INSTRUCTIONS: Record<string, string> = {
  ATLAS:
    'You are ATLAS, system integrity sentinel. Analyze the provided signal snapshot and return JSON: ' +
    '{ ok: boolean, integrity: "nominal"|"stressed"|"degraded"|"critical", confidence: 0-1, ' +
    'anomalies: string[], recommendation: string }',

  ZEUS:
    'You are ZEUS, verification and veto agent. Review the signal data for inconsistencies and ' +
    'return JSON: { verified: boolean, flags: string[], confidence: 0-1, veto: boolean, reason: string|null }',

  ECHO:
    'You are ECHO, intake and hot-lane routing agent. Classify the incoming signal data and ' +
    'return JSON: { priority: "low"|"medium"|"high"|"critical", routes: string[], ' +
    'summary: string, confidence: 0-1 }',

  AUREA:
    'You are AUREA, civic and economic synthesis agent. Assess the civic and economic signal ' +
    'indicators and return JSON: { posture: "stable"|"watch"|"risk"|"alert", ' +
    'keySignals: string[], confidence: 0-1, recommendation: string }',

  JADE:
    'You are JADE, memory and canon framing agent. Evaluate whether the current state warrants ' +
    'a canon entry and return JSON: { canonWorthy: boolean, frameProposal: string|null, ' +
    'confidence: 0-1, rationale: string }',

  HERMES:
    'You are HERMES, narrative velocity agent. Assess information flow health and return JSON: ' +
    '{ velocity: "low"|"normal"|"elevated"|"surge", narrative: string, ' +
    'confidence: 0-1, alerts: string[] }',

  DAEDALUS:
    'You are DAEDALUS, infrastructure diagnostic agent. Analyze infrastructure signal health ' +
    'and return JSON: { healthy: boolean, degradedSystems: string[], ' +
    'confidence: 0-1, action: string|null }',

  EVE:
    'You are EVE, cycle observer. Synthesize the current cycle state and return JSON: ' +
    '{ cycleHealth: "open"|"stressed"|"closing"|"critical", ' +
    'confidence: 0-1, observation: string, nextAction: string|null }',

  URIEL:
    'You are URIEL. Identify adversarial patterns in the signal data. ' +
    'Return JSON: { threat: string|null, severity: "low"|"medium"|"high", ' +
    'evidence: string[], confidence: 0-1 }',

  ZENITH:
    'You are ZENITH. Cross-check agent consensus. ' +
    'Return JSON: { consensus: boolean, dissent: string|null, ' +
    'recommendation: string, confidence: 0-1 }',
};

// Tier → Claude model mapping
export const TIER_MODEL: Record<number, string> = {
  1: 'claude-haiku-4-5-20251001',
  2: 'claude-sonnet-4-6',
  3: 'claude-opus-4-7',
};
