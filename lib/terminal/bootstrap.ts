import { headers } from 'next/headers';
import { isEveSynthesisLedgerSource } from '@/lib/epicon/eveLedgerSource';
import { integrityStatus as mockIntegrityStatus, type IntegrityStatusResponse } from '@/lib/mock/integrityStatus';
import { mockAgents, mockEpicon, mockTripwires } from '@/lib/terminal/mock';
import { transformAgent, transformEpicon } from '@/lib/terminal/transforms';
import type { Agent, EpiconItem, LedgerEntry, Tripwire } from '@/lib/terminal/types';
import type { PromotionStatus } from '@/lib/terminal/api';
import type { TerminalBootstrapSnapshot } from '@/lib/terminal/bootstrap-types';

type JsonRecord = Record<string, unknown>;

function buildBaseUrl(headerBag: Headers): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const host = headerBag.get('x-forwarded-host') ?? headerBag.get('host');
  const proto = headerBag.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : 'http://localhost:3000';
}

async function fetchInternal<T>(baseUrl: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${baseUrl}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function epiconFeedRowToLedger(raw: JsonRecord): LedgerEntry | null {
  if (raw.type !== 'epicon' || raw.verified !== true) return null;
  const id = typeof raw.id === 'string' ? raw.id : '';
  if (!id) return null;
  const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString();
  const summary = typeof raw.body === 'string' ? raw.body : typeof raw.title === 'string' ? raw.title : '';
  const category = raw.category;
  const author = typeof raw.author === 'string' && raw.author.trim() ? raw.author.trim() : '';
  const agentOrigin =
    typeof raw.agentOrigin === 'string' && raw.agentOrigin.trim()
      ? raw.agentOrigin.trim()
      : author.toLowerCase() === 'eve'
        ? 'EVE'
        : author || 'operator';

  const src = raw.source;
  let source: LedgerEntry['source'] = 'echo';
  if (typeof src === 'string') {
    if (isEveSynthesisLedgerSource(src)) source = 'eve-synthesis';
    else if (src === 'agent_commit') source = 'agent_commit';
    else if (src === 'echo') source = 'echo';
    else if (src === 'backfill') source = 'backfill';
    else if (src === 'mock') source = 'mock';
  }

  return {
    id,
    cycleId: typeof raw.cycle === 'string' && raw.cycle ? raw.cycle : 'C-0',
    type: 'epicon',
    agentOrigin,
    timestamp,
    title: typeof raw.title === 'string' ? raw.title : undefined,
    summary,
    integrityDelta: 0,
    status: 'committed',
    category:
      category === 'geopolitical' ||
      category === 'market' ||
      category === 'governance' ||
      category === 'infrastructure' ||
      category === 'narrative' ||
      category === 'ethics' ||
      category === 'civic-risk'
        ? category
        : undefined,
    confidenceTier: typeof raw.confidenceTier === 'number' ? raw.confidenceTier : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
    source,
  };
}

function parseTripwires(raw: JsonRecord | null): Tripwire[] {
  if (!raw) return mockTripwires;
  const runtimeTripwire = raw.tripwire;
  if (runtimeTripwire && typeof runtimeTripwire === 'object') {
    const tripwire = runtimeTripwire as JsonRecord;
    if (!tripwire.active) return [];
    return [{
      id: 'runtime-tripwire',
      label: typeof tripwire.reason === 'string' ? tripwire.reason : 'Runtime tripwire active',
      severity: tripwire.level === 'high' || tripwire.level === 'medium' || tripwire.level === 'low' ? tripwire.level : 'medium',
      owner: typeof tripwire.triggeredBy === 'string' ? tripwire.triggeredBy : 'operator',
      openedAt: typeof tripwire.last_updated === 'string' ? tripwire.last_updated : new Date().toISOString(),
      action: 'Investigate and keep write lanes constrained until resolved.',
    }];
  }

  const list = raw.tripwires;
  if (!Array.isArray(list)) return mockTripwires;
  return list
    .filter((item): item is JsonRecord => item !== null && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : 'tripwire',
      label: typeof item.label === 'string' ? item.label : 'Tripwire active',
      severity: item.severity === 'high' || item.severity === 'medium' || item.severity === 'low' ? item.severity : 'medium',
      owner: typeof item.owner === 'string' ? item.owner : 'operator',
      openedAt: typeof item.opened_at === 'string' ? item.opened_at : new Date().toISOString(),
      action: typeof item.action === 'string' ? item.action : 'Inspect tripwire state.',
    }));
}

export async function getTerminalBootstrapSnapshot(): Promise<TerminalBootstrapSnapshot> {
  const baseUrl = buildBaseUrl(await headers());
  const [agentsRaw, feedRaw, integrityRaw, tripwiresRaw, promotionRaw] = await Promise.all([
    fetchInternal<JsonRecord>(baseUrl, '/api/agents/status'),
    fetchInternal<JsonRecord>(baseUrl, '/api/epicon/feed'),
    fetchInternal<JsonRecord>(baseUrl, '/api/integrity-status'),
    fetchInternal<JsonRecord>(baseUrl, '/api/tripwire/status'),
    fetchInternal<PromotionStatus>(baseUrl, '/api/epicon/promotion-status'),
  ]);

  const agentsList = Array.isArray(agentsRaw?.agents)
    ? agentsRaw.agents
      .filter((item): item is JsonRecord => item !== null && typeof item === 'object')
      .map((agent) => {
        const transformed = transformAgent(agent);
        return {
          ...transformed,
          status:
            transformed.status === 'idle' ||
            transformed.status === 'listening' ||
            transformed.status === 'verifying' ||
            transformed.status === 'routing' ||
            transformed.status === 'analyzing' ||
            transformed.status === 'alert'
              ? transformed.status
              : 'idle',
        };
      })
    : mockAgents;

  const feedItems = Array.isArray(feedRaw?.items)
    ? feedRaw.items.filter((item): item is JsonRecord => item !== null && typeof item === 'object')
    : [];

  const epicon = feedItems.length > 0 ? feedItems.map(transformEpicon) : mockEpicon;
  const feedLedgerRows = feedItems.map(epiconFeedRowToLedger).filter((entry): entry is LedgerEntry => entry !== null);
  const integrityStatus = integrityRaw && integrityRaw.ok ? (integrityRaw as IntegrityStatusResponse) : mockIntegrityStatus;

  return {
    agents: agentsList,
    epicon,
    feedLedgerRows,
    integrityStatus,
    tripwires: parseTripwires(tripwiresRaw),
    promotion: promotionRaw && typeof promotionRaw === 'object' ? promotionRaw : null,
  };
}
