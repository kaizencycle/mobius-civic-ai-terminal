/**
 * instrumentation.ts — Next.js server-startup hook (stable since Next 15,
 * no next.config.ts flag required). Runs once per server process, once per
 * runtime (Node and Edge get separate invocations when a deployment uses
 * both, e.g. app/api/og/route.tsx runs on Edge while most routes run Node).
 *
 * C-442 Agent Egress Observability (ATLAS deliverable): installs a
 * passthrough fetch wrapper so every outbound request this process makes is
 * observed. It changes nothing about what any request does — see
 * lib/net/egress.ts (Node) and lib/net/egress-edge.ts (Edge) for the full
 * design-constraint notes.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installEgressInstrumentation } = await import('@/lib/net/egress');
    installEgressInstrumentation();
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    const { installEgressInstrumentationEdge } = await import('@/lib/net/egress-edge');
    installEgressInstrumentationEdge();
  }
}
