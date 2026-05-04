/**
 * Pulse Selectors for granular data extraction
 * Reduces re-renders by selecting only needed data slices
 */

import type { EPICONEvent } from '@/lib/terminal/types';

export interface Agent {
  id: string;
  name: string;
  status: 'idle' | 'active' | 'offline' | 'degraded';
  lastActivity?: string;
}

export interface GIHistory {
  value: number;
  ts: number;
}

export interface TerminalState {
  epicon: EPICONEvent[];
  agents: Agent[];
  gi: number;
  giHistory: GIHistory[];
  tripwires: any[];
  freshness: number;
}

/**
 * Select only active agents (not idle or offline)
 */
export const selectActiveAgents = (agents: Agent[]): Agent[] => 
  agents.filter(a => a.status !== 'idle' && a.status !== 'offline');

/**
 * Select recent high-confidence EPICON events
 */
export const selectRecentEpicon = (epicon: EPICONEvent[], limit = 50): EPICONEvent[] =>
  epicon.slice(0, limit).filter(e => (e.confidence_tier ?? 0) >= 2);

/**
 * Calculate GI trend over a window
 */
export const selectGITrend = (history: GIHistory[], window = 10): { 
  avg: number; 
  trend: number; 
  direction: 'up' | 'down' | 'stable' 
} => {
  if (history.length === 0) {
    return { avg: 0, trend: 0, direction: 'stable' };
  }
  
  const recent = history.slice(-window);
  const avg = recent.reduce((sum, h) => sum + h.value, 0) / recent.length;
  const trend = recent[recent.length - 1]?.value - recent[0]?.value || 0;
  
  return { 
    avg, 
    trend, 
    direction: trend > 0.01 ? 'up' : trend < -0.01 ? 'down' : 'stable' 
  };
};

/**
 * Select elevated tripwires only
 */
export const selectElevatedTripwires = (tripwires: any[]): any[] =>
  tripwires.filter(t => t.elevated === true || t.severity === 'high' || t.severity === 'critical');

/**
 * Check if data is fresh within SLA
 */
export const selectFreshnessStatus = (freshness: number, slaMs = 900000): 'live' | 'fresh' | 'delayed' | 'stale' => {
  const age = Date.now() - freshness;
  if (age < 5 * 60 * 1000) return 'live';
  if (age < 30 * 60 * 1000) return 'fresh';
  if (age < 120 * 60 * 1000) return 'delayed';
  return 'stale';
};
