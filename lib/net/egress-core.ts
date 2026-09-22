/**
 * lib/net/egress-core.ts — C-442 Agent Egress Observability, runtime-agnostic core.
 *
 * The NET_EGRESS receipt schema, credential classification, and the actual
 * fetch-wrapping logic live here because both the Node runtime installer
 * (lib/net/egress.ts) and the Edge runtime installer (lib/net/egress-edge.ts)
 * need identical receipt-building behavior. This module must never import
 * `node:async_hooks` (or anything else Node-only) — that is exactly what
 * would make it unsafe to load from an Edge route, which is the bug this
 * split fixes (instrumentation.ts previously skipped Edge entirely because
 * the only available installer dragged in AsyncLocalStorage).
 *
 * Attribution (`actor`/`trigger`) is supplied by the caller via `getContext`
 * rather than looked up here, so this module stays agnostic to *how* context
 * is propagated (AsyncLocalStorage on Node, a constant default on Edge).
 */

import { currentCycleId } from '@/lib/eve/cycle-engine';
import { classifyEgress, findAuthorityEntry, recordAnomalyIfNeeded, resolveAuthorityFields } from './egress-anomaly';

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

export const DEFAULT_CONTEXT: NetEgressContext = {
  actor: 'SYSTEM',
  trigger: 'unknown',
};

const NAMED_CREDENTIAL_HEADERS: Array<{ name: string; classify: () => NetEgressCredentialClass }> = [
  { name: 'x-api-key', classify: () => 'api_key' },
  { name: 'apikey', classify: () => 'api_key' },
  { name: 'x-hub-signature-256', classify: () => 'service_token' },
];

/**
 * Inspects header NAMES/scheme prefixes only — never returns or logs a
 * header VALUE. `Authorization: Bearer ...` alone cannot distinguish a
 * service token from an API key (both repos use the Bearer scheme), so
 * that case is resolved against the destination's declared credential
 * class in the authority matrix rather than guessed; an unmatched host
 * honestly reports 'unknown' instead of assuming 'service_token'.
 */
export function classifyCredential(headers: HeadersInit | undefined, host: string): NetEgressCredentialClass {
  if (!headers) return 'none';
  const entries = headers instanceof Headers
    ? Array.from(headers.entries())
    : Array.isArray(headers)
      ? headers
      : Object.entries(headers);

  for (const [rawName, rawValue] of entries) {
    const name = String(rawName).toLowerCase();

    if (name === 'authorization') {
      const value = String(rawValue ?? '').toLowerCase();
      if (value.startsWith('basic ')) return 'oauth';
      if (value.startsWith('bearer ')) {
        const matched = findAuthorityEntry(host);
        return matched ? matched.credentials : 'unknown';
      }
      return 'unknown';
    }

    const match = NAMED_CREDENTIAL_HEADERS.find((c) => c.name === name);
    if (match) return match.classify();
  }
  return 'none';
}

/**
 * `AbortSignal.timeout()` rejects fetch with a `TimeoutError` DOMException
 * directly in some runtimes, but Node's undici often wraps it in a
 * `TypeError: fetch failed` with the real reason on `.cause` — this checks
 * both shapes so a GDELT-style timeout (the exact C-442 evidence trigger)
 * is honestly recorded as `result: 'timeout'` rather than a generic 'error'.
 */
function isTimeoutError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'TimeoutError') return true;
  if (err instanceof Error) {
    if (err.name === 'TimeoutError') return true;
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof DOMException && cause.name === 'TimeoutError') return true;
    if (cause instanceof Error && cause.name === 'TimeoutError') return true;
  }
  return false;
}

export function safeDestination(rawUrl: string): { host: string; path: string } {
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

function safeCycleId(): string {
  try {
    return currentCycleId();
  } catch {
    return 'unknown';
  }
}

/**
 * Builds an instrumented replacement for `globalThis.fetch`. Delegates to
 * the original fetch unmodified — this never changes what a request does,
 * only whether it is observed. `getContext` is called per-request so the
 * Node installer can back it with AsyncLocalStorage while the Edge installer
 * supplies a constant default (Edge has no `node:async_hooks`).
 */
export function createInstrumentedFetch(getContext: () => NetEgressContext): typeof fetch {
  const originalFetch = globalThis.fetch.bind(globalThis);

  return async (input, init) => {
    const startedAt = Date.now();
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const { host, path } = safeDestination(rawUrl);
    const method = (init?.method ?? (typeof input !== 'string' && !(input instanceof URL) ? input.method : undefined) ?? 'GET').toUpperCase();
    const headers = init?.headers ?? (typeof input !== 'string' && !(input instanceof URL) ? input.headers : undefined);
    const credential_class = classifyCredential(headers, host);
    const context = getContext();

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
      result = isTimeoutError(err) ? 'timeout' : 'error';
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
}
