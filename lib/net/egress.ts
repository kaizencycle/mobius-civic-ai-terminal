/**
 * lib/net/egress.ts — C-442 Agent Egress Observability (ATLAS deliverable),
 * Node runtime installer.
 *
 * OBSERVE phase only. This module records a receipt for every outbound
 * `fetch()` call this process makes; it never blocks, denies, rewrites, or
 * delays a request. Capability is unchanged — only visibility is added.
 *
 * The receipt schema, credential classification, and the actual fetch-wrap
 * logic live in ./egress-core (shared with the Edge runtime installer in
 * ./egress-edge.ts, which cannot depend on node:async_hooks). This module
 * adds the one Node-only piece: AsyncLocalStorage-based attribution context.
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
import { createInstrumentedFetch, DEFAULT_CONTEXT, type NetEgressContext } from './egress-core';

export type {
  NetEgressActor,
  NetEgressTrigger,
  NetEgressCredentialClass,
  NetEgressResult,
  NetEgressPersistentEffect,
  NetEgressContext,
  NetEgressReceipt,
} from './egress-core';
export { classifyCredential, recordEgress, safeDestination } from './egress-core';

const egressContextStorage = new AsyncLocalStorage<NetEgressContext>();

/** Run `fn` with an explicit egress context so outbound fetches inside it are attributed. */
export function withEgressContext<T>(context: Partial<NetEgressContext>, fn: () => T | Promise<T>): T | Promise<T> {
  const merged: NetEgressContext = { ...DEFAULT_CONTEXT, ...egressContextStorage.getStore(), ...context };
  return egressContextStorage.run(merged, fn);
}

export function getEgressContext(): NetEgressContext {
  return egressContextStorage.getStore() ?? DEFAULT_CONTEXT;
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

  globalThis.fetch = createInstrumentedFetch(getEgressContext);
  flagged.__mobiusEgressInstrumented = true;
  installed = true;
}
