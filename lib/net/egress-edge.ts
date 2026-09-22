/**
 * lib/net/egress-edge.ts — C-442 Agent Egress Observability (ATLAS deliverable),
 * Edge runtime installer.
 *
 * Edge routes (e.g. `app/api/og/route.tsx`, `export const runtime = 'edge'`)
 * never went through lib/net/egress.ts's installer, because that module
 * imports `node:async_hooks`, which the Edge runtime does not provide — so
 * an Edge route's outbound fetches produced no NET_EGRESS receipt at all.
 * This installer builds on the same runtime-agnostic wrapper
 * (./egress-core) without touching AsyncLocalStorage, so it is safe to load
 * from instrumentation.ts's Edge branch.
 *
 * `withEgressContext` has no Edge equivalent in this PR — Edge receipts
 * always report the honest default (actor: 'SYSTEM', trigger: 'unknown')
 * rather than guessed attribution. No Edge call site in this codebase is an
 * AGENT_SELECTED path today (see docs/architecture/network-egress-inventory-c442.md),
 * so this is not a loss of attribution this PR was otherwise providing.
 */

import { createInstrumentedFetch, DEFAULT_CONTEXT } from './egress-core';

let installed = false;

/** Edge-runtime counterpart to installEgressInstrumentation() in ./egress.ts. */
export function installEgressInstrumentationEdge(): void {
  if (installed) return;
  const flagged = globalThis as typeof globalThis & { __mobiusEgressInstrumented?: boolean };
  if (flagged.__mobiusEgressInstrumented) {
    installed = true;
    return;
  }

  globalThis.fetch = createInstrumentedFetch(() => DEFAULT_CONTEXT);
  flagged.__mobiusEgressInstrumented = true;
  installed = true;
}
