/**
 * Dual-write: publish Terminal snapshots to OAA sovereign memory, then optional Civic Core proof.
 * KV remains source of hot reads; this path is append-only journal + durable envelope.
 */

import { terminalInternalOrigin } from '@/lib/oaa/internalOrigin';
import { OAADataClient } from '@/lib/ingestion/OAADataClient';
import { isOaaPublishEnabled } from '@/lib/mesh/loadMobiusYaml';
import { postMobiusIngest } from '@/lib/mesh/ingestClient';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';

async function fetchJson(path: string): Promise<unknown> {
  const origin = terminalInternalOrigin();
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`fetch_${path}_${res.status}`);
  return res.json();
}

export type PublishKind =
  | 'mic_readiness'
  | 'vault_status'
  | 'heartbeat'
  | 'reconciliation'
  | 'slack_agent_command';

export async function publishToOaaAndLedger(args: {
  kind: PublishKind;
  key: string;
  value: unknown;
  agent?: string;
  intent?: string;
}): Promise<{
  oaa: { ok: boolean; skipped?: boolean; error?: string; hash?: string };
  ledger: { ok: boolean; skipped?: boolean; reason?: string };
}> {
  if (!isOaaPublishEnabled()) {
    return { oaa: { ok: false, skipped: true, error: 'oaa_publish_disabled' }, ledger: { ok: false, skipped: true, reason: 'oaa_publish_disabled' } };
  }

  const client = OAADataClient.fromEnv();
  if (!client) {
    return { oaa: { ok: false, skipped: true, error: 'oaa_client_unconfigured' }, ledger: { ok: false, skipped: true, reason: 'oaa_client_unconfigured' } };
  }

  let cycle = 'unknown';
  try {
    cycle = await resolveOperatorCycleId();
  } catch {
    cycle = 'unknown';
  }

  const oaa = await client.write({
    key: args.key,
    value: args.value,
    agent: args.agent ?? 'TERMINAL',
    cycle,
    intent: args.intent ?? `publish:${args.kind}`,
    previousHash: null,
  });

  let ledger: { ok: boolean; skipped?: boolean; reason?: string } = { ok: false, skipped: true, reason: 'oaa_not_ok' };
  if (oaa.ok && oaa.hash) {
    const proof = {
      type: 'OAA_MEMORY_ENTRY_V1',
      kind: args.kind,
      key: args.key,
      agent: args.agent ?? 'TERMINAL',
      cycle,
      intent: args.intent ?? `publish:${args.kind}`,
      hash: oaa.hash,
      previous_hash: oaa.previous_hash ?? null,
      timestamp: new Date().toISOString(),
    };
    const r = await postMobiusIngest({ type: 'OAA_MEMORY_ENTRY_V1', payload: proof });
    if (r.ok) ledger = { ok: true };
    else if ('skipped' in r && r.skipped) ledger = { ok: false, skipped: true, reason: r.reason };
    else ledger = { ok: false, skipped: false, reason: 'error' in r ? r.error : 'ledger_failed' };
  }

  return {
    oaa: oaa.ok ? { ok: true, hash: oaa.hash } : { ok: false, error: 'error' in oaa ? oaa.error : 'oaa_failed' },
    ledger,
  };
}

export async function publishMicReadinessFromTerminal(): Promise<ReturnType<typeof publishToOaaAndLedger>> {
  const data = await fetchJson('/api/mic/readiness');
  return publishToOaaAndLedger({
    kind: 'mic_readiness',
    key: 'mic:readiness',
    value: data,
    intent: 'terminal mic readiness snapshot',
  });
}

export async function publishVaultStatusFromTerminal(): Promise<ReturnType<typeof publishToOaaAndLedger>> {
  const data = await fetchJson('/api/vault/status');
  return publishToOaaAndLedger({
    kind: 'vault_status',
    key: 'vault:status',
    value: data,
    intent: 'terminal vault status snapshot',
  });
}

export async function publishHeartbeatFromTerminal(): Promise<ReturnType<typeof publishToOaaAndLedger>> {
  const data = await fetchJson('/api/terminal/snapshot-lite');
  return publishToOaaAndLedger({
    kind: 'heartbeat',
    key: 'terminal:snapshot-lite',
    value: data,
    intent: 'terminal snapshot-lite heartbeat',
  });
}

export async function publishReconciliationFromTerminal(args: {
  historicalObservedReserve: number;
  sealedReserveTotal: number;
  currentTrancheBalance: number;
  legacyCarryforwardBalance: number;
  unreconciledGap: number;
}): Promise<ReturnType<typeof publishToOaaAndLedger>> {
  return publishToOaaAndLedger({
    kind: 'reconciliation',
    key: 'vault:reconciliation',
    value: { ...args, ts: new Date().toISOString() },
    intent: 'reserve reconciliation snapshot',
  });
}
