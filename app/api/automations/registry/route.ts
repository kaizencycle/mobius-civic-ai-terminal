import { NextResponse } from 'next/server';
import { AGENT_REGISTRY_VERSION, MOBIUS_AGENT_REGISTRY } from '@/lib/agents/registry';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const automationRegistry = [
  {
    id: 'echo-sweep',
    agent: 'ECHO',
    status: 'declared',
    schedule: 'cron/sweep',
    reads: ['/api/epicon/feed', '/api/signals/micro', '/api/integrity-status'],
    writes: ['/api/agents/journal', '/api/echo/ingest'],
    scope_ref: MOBIUS_AGENT_REGISTRY.ECHO.registry_id,
  },
  {
    id: 'atlas-heartbeat',
    agent: 'ATLAS',
    status: 'declared',
    schedule: 'heartbeat / sentinel cron',
    reads: ['/api/quorum/state', '/api/integrity-status', '/api/chambers/lane-diagnostics'],
    writes: ['/api/agents/journal', 'docs/catalog/heartbeats'],
    scope_ref: MOBIUS_AGENT_REGISTRY.ATLAS.registry_id,
  },
  {
    id: 'zeus-watchdog',
    agent: 'ZEUS',
    status: 'declared',
    schedule: 'cron/watchdog + quorum verification',
    reads: ['/api/quorum/state', '/api/epicon/feed', '/api/chambers/ledger'],
    writes: ['/api/agents/journal', 'docs/catalog/zeus'],
    scope_ref: MOBIUS_AGENT_REGISTRY.ZEUS.registry_id,
  },
  {
    id: 'aurea-daily-close',
    agent: 'AUREA',
    status: 'declared',
    schedule: '23:00 UTC end-of-cycle',
    reads: ['/api/epicon/feed', '/api/integrity-status', '/api/signals/micro', '/api/sentiment/composite'],
    writes: ['/api/agents/journal', 'docs/catalog/aurea'],
    scope_ref: MOBIUS_AGENT_REGISTRY.AUREA.registry_id,
  },
  {
    id: 'eve-escalation',
    agent: 'EVE',
    status: 'declared',
    schedule: 'GI critical / escalation trigger',
    reads: ['/api/quorum/state', '/api/chambers/journal', '/api/integrity-status'],
    writes: ['/api/agents/journal', 'docs/catalog/eve'],
    scope_ref: MOBIUS_AGENT_REGISTRY.EVE.registry_id,
  },
  {
    id: 'jade-canon-pass',
    agent: 'JADE',
    status: 'declared',
    schedule: 'canon annotation pass',
    reads: ['/api/quorum/state', '/api/chambers/journal', '/api/protocol/state-machine'],
    writes: ['/api/agents/journal', 'docs/catalog/jade'],
    scope_ref: MOBIUS_AGENT_REGISTRY.JADE.registry_id,
  },
  {
    id: 'hermes-routing-sweep',
    agent: 'HERMES',
    status: 'declared',
    schedule: 'routing / priority sweep',
    reads: ['/api/terminal/snapshot', '/api/chambers/lane-diagnostics', '/api/echo/digest'],
    writes: ['/api/agents/journal', 'KV routing hints'],
    scope_ref: MOBIUS_AGENT_REGISTRY.HERMES.registry_id,
  },
  {
    id: 'daedalus-infra-diagnostic',
    agent: 'DAEDALUS',
    status: 'declared',
    schedule: 'infra diagnostic cron / build-failure review',
    reads: ['/api/quorum/state', '/api/chambers/lane-diagnostics', '/api/terminal/shell'],
    writes: ['/api/agents/journal', 'docs/catalog/daedalus'],
    scope_ref: MOBIUS_AGENT_REGISTRY.DAEDALUS.registry_id,
  },
];

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: AGENT_REGISTRY_VERSION,
    automations: automationRegistry,
    note: 'This registry is declared from Mobius canonical agent scopes. It does not enumerate hidden Codex/Claude local automation IDs yet.',
    canon: 'Mobius should know its own behaviors before it trusts its own automation loop.',
  }, { headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'automation-registry' } });
}
