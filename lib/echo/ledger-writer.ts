/**
 * ECHO Ledger Writer
 *
 * Generates JSON snapshots and a markdown dashboard from ECHO ingest data,
 * mirroring the mobius-bot divergence documentation pattern:
 *
 *   docs/echo/dashboard.md        — human-readable summary
 *   docs/echo/data.json           — current snapshot
 *   docs/echo/history/{ts}.json   — timestamped snapshots
 *   docs/echo/history/events.json — cumulative event log
 *   docs/echo/history/index.json  — timeline of all snapshots
 */

import type { EpiconItem, LedgerEntry, CivicRadarAlert } from '@/lib/terminal/types';

// ── Types ────────────────────────────────────────────────────

export type EchoSnapshot = {
  repo: string;
  generated_at: string;
  cycle_id: string;
  source_counts: {
    gdelt: number;
    usgs: number;
    coingecko: number;
    total: number;
  };
  by_severity: {
    high: number;
    medium: number;
    low: number;
  };
  by_category: {
    geopolitical: number;
    market: number;
    infrastructure: number;
    governance: number;
  };
  alert_count: number;
  ledger_count: number;
  epicon_count: number;
  epicon_sig: Record<string, {
    title: string;
    category: string;
    severity: string;
    confidence: number;
    agent: string;
    source: string;
  }>;
};

export type EchoEvent = {
  ts: string;
  cycle_id: string;
  action: string;
  sources: number;
  epicon: number;
  ledger: number;
  alerts: number;
};

export type EchoTimeline = {
  repo: string;
  updated_at: string;
  timeline: EchoSnapshot[];
};

export type EchoEventLog = {
  repo: string;
  updated_at: string;
  events: EchoEvent[];
};

const REPO = 'kaizencycle/mobius-civic-ai-terminal';
const MAX_TIMELINE_ENTRIES = 100;
const MAX_EVENTS = 500;

// ── Snapshot builder ─────────────────────────────────────────

export function buildSnapshot(
  cycleId: string,
  epicon: EpiconItem[],
  ledger: LedgerEntry[],
  alerts: CivicRadarAlert[],
  timestamp: string,
): EchoSnapshot {
  const bySeverity = { high: 0, medium: 0, low: 0 };
  const byCategory = {
    geopolitical: 0,
    market: 0,
    infrastructure: 0,
    governance: 0,
    narrative: 0,
  };
  const sourceCounts = { gdelt: 0, usgs: 0, coingecko: 0, total: 0 };

  for (const item of epicon) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;

    // Map confidence tier back to severity
    if (item.confidenceTier >= 3) bySeverity.high++;
    else if (item.confidenceTier >= 2) bySeverity.medium++;
    else bySeverity.low++;

    // Count sources
    for (const s of item.sources) {
      if (s === 'GDELT') sourceCounts.gdelt++;
      else if (s === 'USGS') sourceCounts.usgs++;
      else if (s === 'CoinGecko') sourceCounts.coingecko++;
    }
    sourceCounts.total++;
  }

  // Build epicon signature map (like pr_sig in divergence)
  const epiconSig: EchoSnapshot['epicon_sig'] = {};
  for (const item of epicon.slice(0, 20)) {
    epiconSig[item.id] = {
      title: item.title.slice(0, 80),
      category: item.category,
      severity: item.confidenceTier >= 3 ? 'high' : item.confidenceTier >= 2 ? 'medium' : 'low',
      confidence: item.confidenceTier,
      agent: item.ownerAgent,
      source: item.sources[0] ?? 'unknown',
    };
  }

  return {
    repo: REPO,
    generated_at: timestamp,
    cycle_id: cycleId,
    source_counts: sourceCounts,
    by_severity: bySeverity,
    by_category: byCategory,
    alert_count: alerts.length,
    ledger_count: ledger.length,
    epicon_count: epicon.length,
    epicon_sig: epiconSig,
  };
}

// ── Event builder ────────────────────────────────────────────

export function buildEvent(
  cycleId: string,
  sourceCount: number,
  epiconCount: number,
  ledgerCount: number,
  alertCount: number,
  timestamp: string,
): EchoEvent {
  return {
    ts: timestamp,
    cycle_id: cycleId,
    action: 'ingest',
    sources: sourceCount,
    epicon: epiconCount,
    ledger: ledgerCount,
    alerts: alertCount,
  };
}

// ── Dashboard markdown builder ───────────────────────────────

export function buildDashboard(snapshot: EchoSnapshot): string {
  const lines: string[] = [
    '# ECHO Ingest Dashboard',
    '',
    `**Repo:** \`${snapshot.repo}\`  `,
    `**Generated:** \`${snapshot.generated_at}\`  `,
    `**Cycle:** \`${snapshot.cycle_id}\`  `,
    `**Sources ingested:** \`${snapshot.source_counts.total}\``,
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|--------|-------|',
    `| EPICON events | ${snapshot.epicon_count} |`,
    `| Ledger entries | ${snapshot.ledger_count} |`,
    `| Active alerts | ${snapshot.alert_count} |`,
    '',
    '## By Severity',
    '',
    '| Severity | Count |',
    '|----------|-------|',
    `| High | ${snapshot.by_severity.high} |`,
    `| Medium | ${snapshot.by_severity.medium} |`,
    `| Low | ${snapshot.by_severity.low} |`,
    '',
    '## By Category',
    '',
    '| Category | Count |',
    '|----------|-------|',
    `| Geopolitical | ${snapshot.by_category.geopolitical} |`,
    `| Market | ${snapshot.by_category.market} |`,
    `| Infrastructure | ${snapshot.by_category.infrastructure} |`,
    `| Governance | ${snapshot.by_category.governance} |`,
    '',
    '## Sources',
    '',
    '| Source | Events |',
    '|--------|--------|',
    `| GDELT | ${snapshot.source_counts.gdelt} |`,
    `| USGS | ${snapshot.source_counts.usgs} |`,
    `| CoinGecko | ${snapshot.source_counts.coingecko} |`,
    '',
    '## EPICON Signals',
    '',
  ];

  const entries = Object.entries(snapshot.epicon_sig);
  if (entries.length === 0) {
    lines.push('_No signals in current cycle._');
  } else {
    lines.push('| ID | Title | Category | Severity | Agent |');
    lines.push('|----|-------|----------|----------|-------|');
    for (const [id, sig] of entries) {
      lines.push(`| ${id} | ${sig.title} | ${sig.category} | ${sig.severity} | ${sig.agent} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ── File content builders (for API route to write) ───────────

export function appendToTimeline(
  existing: EchoTimeline | null,
  snapshot: EchoSnapshot,
): EchoTimeline {
  const timeline = existing?.timeline ?? [];
  timeline.push(snapshot);

  // Cap size
  while (timeline.length > MAX_TIMELINE_ENTRIES) {
    timeline.shift();
  }

  return {
    repo: REPO,
    updated_at: snapshot.generated_at,
    timeline,
  };
}

export function appendToEventLog(
  existing: EchoEventLog | null,
  event: EchoEvent,
): EchoEventLog {
  const events = existing?.events ?? [];
  events.push(event);

  // Cap size
  while (events.length > MAX_EVENTS) {
    events.shift();
  }

  return {
    repo: REPO,
    updated_at: event.ts,
    events,
  };
}
