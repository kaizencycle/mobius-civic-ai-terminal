/**
 * lib/net/egress.ts — C-442 Agent Egress Observability (ATLAS deliverable).
 *
 * OBSERVE phase only. This module records a receipt for every outbound
 * `fetch()` call this process makes; it never blocks, denies, rewrites, or
 * delays a request. Capability is unchanged — only visibility is added.
 *
 * Design constraints (see docs/epicon/cycles/C-442):
 * - Never log secret values, credential values, Authorization header
 *   contents, cookies, or full sensitive query strings. Only the *class* of
 *   credential attached (none | service_token | api_key | oauth | unknown)
 *   is recorded, derived from header/env NAMES, never their values.
 * - `actor`/`trigger` are best-effort. Most call sites in this codebase are
 *   not wrapped with `withEgressContext`, so most receipts honestly report
 *   actor: 'SYSTEM', trigger: 'unknown' rather than a guessed attribution.
 *   `withEgressContext` is exported so future call sites can opt in; this
 *   PR wires it into exactly one route (`/api/crawler/integrity-scan`, the
 *   one AGENT_SELECTED path found in the C-442 HERMES inventory) as a
 *   worked example, not a blanket retrofit.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { classifyEgress, recordAnomalyIfNeeded, resolveAuthorityFields } from './egress-anomaly';

export type NetEgressActor =
  | 'SYSTEM'
  | 'USER'
  | 'HERMES'
  | 'ATLAS'
  | 'ZEUS'
  | 'EVE'
  | 'ECHO'
  | 'JADE'
  | 'AUREA'
  | 'DAEDALUS';

export type NetEgressTrigger = 'cron' | 'ui' | 'api' | 'internal' | 'agent' | 'unknown';

export type NetEgressCredentialClass = 'none' | 'service_token' | 'api_key' | 'oauth' | 'unknown';

export type NetEgressResult = 'success' | 'denied' | 'timeout' | 'error';

export type NetEgressPersistentEffect = 'none' | 'journal' | 'epicon' | 'ledger' | 'kv' | 'unknown';

export interface NetEgressContext {
  actor: NetEgressActor;
  trigger: NetEgressTrigger;
  reason?: string;
  source_epicon?: string;
  derived_from?: string;
  /** Caller's own expectation, if it knows — the anomaly classifier still evaluates independently. */
  expected_destination?: boolean | 'unknown';
}

export interface NetEgressReceipt {
  event: 'NET_EGRESS';
  timestamp: string;
  cycle: string;
  actor: NetEgressActor;
  trigger: NetEgressTrigger;
  destination_host: string;
  destination_path: string;
  method: string;
  authority: 'UNRESOLVED' | string;
  authority_scope: string;
  expected_destination: boolean | 'unknown';
  credential_class: NetEgressCredentialClass;
  reason?: string;
  source_epicon?: string;
  derived_from?: string;
  result: NetEgressResult;
  status_code?: number;
  persistent_effect: NetEgressPersistentEffect;
  duration_ms: number;
}

const DEFAULT_CONTEXT: NetEgressContext = {
  actor: 'SYSTEM',
  trigger: 'unknown',
};

const egressContextStorage = new AsyncLocalStorage<NetEgressContext>();

/** Run `fn` with an explicit egress context so outbound fetches inside it are attributed. */
export function withEgressContext<T>(context: Partial<NetEgressContext>, fn: () => T | Promise<T>): T | Promise<T> {
  const merged: NetEgressContext = { ...DEFAULT_CONTEXT, ...egressContextStorage.getStore(), ...context };
  return egressContextStorage.run(merged, fn);
}

export function getEgressContext(): NetEgressContext {
  return egressContextStorage.getStore() ?? DEFAULT_CONTEXT;
}

const CREDENTIAL_HEADER_NAMES: Array<{ name: string; classify: (value: string) => NetEgressCredentialClass }> = [
  {
    name: 'authorization',
    classify: (value) => {
      const lower = value.toLowerCase();
      if (lower.startsWith('bearer ')) return 'service_token';
      if (lower.startsWith('basic ')) return 'oauth';
      return 'unknown';
    },
  },
  { name: 'x-api-key', classify: () => 'api_key' },
  { name: 'apikey', classify: () => 'api_key' },
  { name: 'x-hub-signature-256', classify: () => 'service_token' },
];

/** Inspects header NAMES/prefixes only — never returns or logs a header VALUE. */
function classifyCredential(headers: HeadersInit | undefined): NetEgressCredentialClass {
  if (!headers) return 'none';
  const entries = headers instanceof Headers
    ? Array.from(headers.entries())
    : Array.isArray(headers)
      ? headers
      : Object.entries(headers);

  for (const [rawName, rawValue] of entries) {
    const name = String(rawName).toLowerCase();
    const match = CREDENTIAL_HEADER_NAMES.find((c) => c.name === name);
    if (match) return match.classify(String(rawValue ?? ''));
  }
  return 'none';
}

function safeDestination(rawUrl: string): { host: string; path: string } {
  try {
    const u = new URL(rawUrl, 'http://internal.invalid');
    return { host: u.host || 'internal', path: u.pathname };
  } catch {
    return { host: 'unparseable', path: '' };
  }
}

/**
 * Emits one structured, greppable log line per outbound request. This is the
 * durable record for the OBSERVE phase — no KV/journal write is introduced
 * by this PR (see EPICON C-442 "Not done in this PR"). `console.log` lands
 * in the same Vercel log stream that produced the C-442 evidence trigger.
 */
export function recordEgress(receipt: NetEgressReceipt): void {
  // eslint-disable-next-line no-console
  console.log(`NET_EGRESS ${JSON.stringify(receipt)}`);
}

let installed = false;

/**
 * Wraps `globalThis.fetch` exactly once per process. Delegates to the
 * original fetch unmodified — this never changes what a request does, only
 * whether it is observed. Idempotent: safe to call more than once (e.g. hot
 * reload in dev).
 */
export function installEgressInstrumentation(): void {
  if (installed) return;
  const flagged = globalThis as typeof globalThis & { __mobiusEgressInstrumented?: boolean };
  if (flagged.__mobiusEgressInstrumented) {
    installed = true;
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);

  const instrumentedFetch: typeof fetch = async (input, init) => {
    const startedAt = Date.now();
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const { host, path } = safeDestination(rawUrl);
    const method = (init?.method ?? (typeof input !== 'string' && !(input instanceof URL) ? input.method : undefined) ?? 'GET').toUpperCase();
    const headers = init?.headers ?? (typeof input !== 'string' && !(input instanceof URL) ? input.headers : undefined);
    const credential_class = classifyCredential(headers);
    const context = getEgressContext();

    let result: NetEgressResult = 'success';
    let status_code: number | undefined;
    let response: Response | undefined;
    let thrown: unknown;

    try {
      response = await originalFetch(input, init);
      status_code = response.status;
      if (!response.ok) result = 'error';
    } catch (err) {
      thrown = err;
      result = err instanceof DOMException && err.name === 'TimeoutError' ? 'timeout' : 'error';
    }

    const authorityFields = resolveAuthorityFields(host);

    const receipt: NetEgressReceipt = {
      event: 'NET_EGRESS',
      timestamp: new Date().toISOString(),
      cycle: safeCycleId(),
      actor: context.actor,
      trigger: context.trigger,
      destination_host: host,
      destination_path: path,
      method,
      authority: authorityFields.authority,
      authority_scope: authorityFields.authority_scope,
      expected_destination: context.expected_destination ?? authorityFields.expected_destination,
      credential_class,
      reason: context.reason,
      source_epicon: context.source_epicon,
      derived_from: context.derived_from,
      result,
      status_code,
      persistent_effect: 'unknown',
      duration_ms: Date.now() - startedAt,
    };

    recordEgress(receipt);
    recordAnomalyIfNeeded(receipt, classifyEgress(receipt));

    if (thrown) throw thrown;
    return response as Response;
  };

  globalThis.fetch = instrumentedFetch;
  flagged.__mobiusEgressInstrumented = true;
  installed = true;
}

function safeCycleId(): string {
  try {
    return currentCycleId();
  } catch {
    return 'unknown';
  }
}
