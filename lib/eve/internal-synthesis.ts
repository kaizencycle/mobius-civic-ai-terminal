import { Redis } from '@upstash/redis';

import type { EveNewsItem, EveSynthesis, NewsCategory, Severity } from '@/lib/eve/global-news';
import type { EpiconLedgerFeedEntry } from '@/lib/epicon/ledgerFeedTypes';
import { pushLedgerEntry } from '@/lib/epicon/ledgerPush';
import { getMemoryLedgerEntries } from '@/lib/epicon/memoryLedgerFeed';
import { getEchoAlerts } from '@/lib/echo/store';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { integrityStatus } from '@/lib/mock/integrityStatus';
import { mockCivicAlerts } from '@/lib/terminal/mock';
import { getTreasuryAlerts } from '@/lib/treasury/alerts';
import { getTripwireState } from '@/lib/tripwire/store';

type InternalSynthesisResult = {
  cycleId: string;
  items: EveNewsItem[];
  pattern_notes: string[];
  dominant_category: NewsCategory;
  dominant_region: string;
  global_tension: EveSynthesis['global_tension'];
  committed: boolean;
};

const SYNTHESIS_TAG = 'eve-internal-synthesis';

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

async function readLedgerRows(limit = 250): Promise<EpiconLedgerFeedEntry[]> {
  const rows: EpiconLedgerFeedEntry[] = [];
  const redis = getRedisClient();

  if (redis) {
    try {
      const [primary, alias] = await Promise.all([
        redis.lrange<string>('mobius:epicon:feed', 0, limit - 1),
        redis.lrange<string>('epicon:feed', 0, limit - 1),
      ]);

      for (const raw of [...primary, ...alias]) {
        try {
          rows.push(JSON.parse(raw) as EpiconLedgerFeedEntry);
        } catch {
          // ignore malformed rows
        }
      }
    } catch {
      // fall through to memory mirror
    }
  }

  rows.push(...getMemoryLedgerEntries(limit));
  return rows;
}

function severityRank(severity: Severity): number {
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}

function maxSeverity(a: Severity, b: Severity): Severity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

function scoreToSeverity(score: number): Severity {
  if (score < 0.72) return 'high';
  if (score < 0.84) return 'medium';
  return 'low';
}

function tensionFromHighestSeverity(highest: Severity): EveSynthesis['global_tension'] {
  if (highest === 'high') return 'high';
  if (highest === 'medium') return 'elevated';
  return 'moderate';
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 140);
}

function idFor(cycleId: string, suffix: string): string {
  return `eve-internal-${cycleId.toLowerCase()}-${suffix}`;
}

function ledgerIdFor(cycleId: string): string {
  return `LE-${cycleId}-EVE-INTERNAL-SYNTHESIS`;
}

function selectDominantCategory(items: EveNewsItem[]): NewsCategory {
  const counts = new Map<NewsCategory, number>();
  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'governance';
}

export async function buildAndCommitEveInternalSynthesis(): Promise<InternalSynthesisResult> {
  const cycleId = currentCycleId();
  const timestamp = nowIso();
  const ledgerRows = await readLedgerRows(300);

  const committedAgentRows = ledgerRows.filter(
    (row) => row.source === 'agent_commit' && row.status === 'committed' && row.cycle === cycleId,
  );

  const actorSet = new Set(
    committedAgentRows
      .map((row) => row.agentOrigin ?? row.author)
      .filter((agent): agent is string => typeof agent === 'string' && agent.trim().length > 0),
  );

  const tripwire = getTripwireState();
  const echoAlerts = getEchoAlerts();
  const civicAlerts = echoAlerts.length > 0 ? echoAlerts : mockCivicAlerts;

  let treasuryStatus = 'unavailable';
  let treasuryTripwireCount = 0;
  let treasuryAlertCount = 0;
  try {
    const treasury = await getTreasuryAlerts();
    treasuryStatus = treasury.status;
    treasuryTripwireCount = treasury.tripwires.length;
    treasuryAlertCount = treasury.alerts.length;
  } catch {
    // degrade gracefully
  }

  const gi = integrityStatus.global_integrity;
  const mii = integrityStatus.mii_baseline;
  const giSeverity = scoreToSeverity(gi);
  const miiSeverity = scoreToSeverity(mii);
  const tripwireSeverity: Severity =
    tripwire.level === 'high' || tripwire.level === 'triggered' || tripwire.level === 'suspended'
      ? 'high'
      : tripwire.level === 'medium' || tripwire.level === 'watch'
        ? 'medium'
        : 'low';

  const combinedSeverity = maxSeverity(maxSeverity(giSeverity, miiSeverity), tripwireSeverity);

  const agentList = [...actorSet].sort();
  const governanceSummaryTitle = sanitizeTitle(
    `EVE review: governance posture for ${cycleId} across committed agent lanes`,
  );
  const governanceSummary =
    `Cycle ${cycleId} has ${committedAgentRows.length} committed agent rows ` +
    `from ${agentList.length > 0 ? agentList.join(', ') : 'no active agent authors yet'}. ` +
    `GI=${gi.toFixed(2)}, MII=${mii.toFixed(2)}, treasury=${treasuryStatus}.`;

  const publicRiskTitle = sanitizeTitle(`EVE framing: civic-risk transmission watch for ${cycleId}`);
  const publicRisk =
    `Public-risk framing: civic radar is carrying ${civicAlerts.length} alert(s), ` +
    `treasury watch reports ${treasuryTripwireCount} tripwire(s) and ${treasuryAlertCount} alert(s), ` +
    `and tripwire posture is ${tripwire.level}.`;

  const cautionTitle = sanitizeTitle(`EVE caution: operator integrity posture note for ${cycleId}`);
  const caution =
    tripwire.active
      ? `Operator caution: active tripwire (${tripwire.level}) — ${tripwire.reason}. Keep narrative claims subordinate to committed ledger evidence.`
      : 'Operator caution: no active runtime tripwire, but preserve verification discipline and avoid narrative overreach.';

  const items: EveNewsItem[] = [
    {
      id: idFor(cycleId, 'governance'),
      title: governanceSummaryTitle,
      summary: governanceSummary,
      url: '/api/epicon/feed',
      source: 'EVE Internal Substrate',
      region: 'System',
      timestamp,
      category: 'governance',
      severity: combinedSeverity,
      eve_tag: 'Internal governance synthesis from committed substrate state',
    },
    {
      id: idFor(cycleId, 'civic-risk'),
      title: publicRiskTitle,
      summary: publicRisk,
      url: '/api/echo/feed',
      source: 'EVE Civic Radar',
      region: 'Public Sphere',
      timestamp,
      category: 'civic-risk',
      severity: maxSeverity(combinedSeverity, civicAlerts.length >= 3 ? 'medium' : 'low'),
      eve_tag: 'Public-risk framing from civic radar and treasury watch',
    },
    {
      id: idFor(cycleId, 'ethics'),
      title: cautionTitle,
      summary: caution,
      url: '/api/tripwire/status',
      source: 'EVE Integrity Posture',
      region: 'Operator',
      timestamp,
      category: 'ethics',
      severity: tripwireSeverity,
      eve_tag: 'Operator caution memo for integrity-preserving execution',
    },
  ];

  const pattern_notes = [
    `Internal-first synthesis: ${committedAgentRows.length} committed agent rows observed in ${cycleId}.`,
    `Tripwire posture ${tripwire.level}; treasury ${treasuryStatus}; civic radar alerts ${civicAlerts.length}.`,
    `EVE lane active: governance + ethics + civic-risk synthesis remains available even when external feeds degrade.`,
  ];

  let committed = false;
  const existing = committedAgentRows.find(
    (row) =>
      row.author === 'EVE' &&
      row.tags.includes(SYNTHESIS_TAG) &&
      row.id === ledgerIdFor(cycleId),
  );

  if (!existing) {
    const body = [
      governanceSummary,
      publicRisk,
      caution,
    ].join('\n\n');

    await pushLedgerEntry({
      id: ledgerIdFor(cycleId),
      timestamp,
      author: 'EVE',
      title: governanceSummaryTitle,
      body,
      type: 'epicon',
      severity: combinedSeverity,
      tags: [SYNTHESIS_TAG, 'governance', 'ethics', 'civic-risk'],
      source: 'agent_commit',
      verified: true,
      verifiedBy: 'ZEUS',
      cycle: cycleId,
      category: 'governance',
      confidenceTier: 2,
      status: 'committed',
      agentOrigin: 'EVE',
    });
    committed = true;
  }

  return {
    cycleId,
    items,
    pattern_notes,
    dominant_category: selectDominantCategory(items),
    dominant_region: 'System',
    global_tension: tensionFromHighestSeverity(combinedSeverity),
    committed,
  };
}
