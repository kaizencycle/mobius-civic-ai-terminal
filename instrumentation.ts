/**
 * instrumentation.ts — Next.js server-startup hook (stable since Next 15,
 * no next.config.ts flag required). Runs once per server process.
 *
 * C-442 Agent Egress Observability (ATLAS deliverable): installs a
 * passthrough fetch wrapper so every outbound request this process makes is
 * observed. It changes nothing about what any request does — see
 * lib/net/egress.ts for the full design-constraint notes.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installEgressInstrumentation } = await import('@/lib/net/egress');
    installEgressInstrumentation();
  }
}
