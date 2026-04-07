/**
 * Fire-and-forget: after a live EVE observation, run the full synthesis pipeline once per cycle
 * (per server instance). Never throws to callers.
 */

let lastPipelineCycleTriggered: string | null = null;

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function triggerEveSynthesisPipelineAfterObservation(baseUrl: string): void {
  /** Bearer must match POST /api/eve/pipeline-synthesize → cycle-synthesize (service secrets). */
  const secret =
    process.env.BACKFILL_SECRET ??
    process.env.MOBIUS_SERVICE_SECRET ??
    process.env.CRON_SECRET ??
    process.env.RENDER_SCHEDULER_SECRET;
  if (!secret?.trim()) {
    return;
  }

  void (async () => {
    try {
      const cycleRes = await fetch(`${baseUrl}/api/eve/cycle-advance`, { cache: 'no-store' });
      const cycleJson = (await readJson(cycleRes)) as { currentCycle?: unknown } | null;
      const rawCycle = cycleJson?.currentCycle;
      const cycleId = typeof rawCycle === 'string' && rawCycle.trim() ? rawCycle.trim() : '';
      if (!cycleId) {
        return;
      }
      if (lastPipelineCycleTriggered === cycleId) {
        return;
      }
      lastPipelineCycleTriggered = cycleId;

      const pipeRes = await fetch(`${baseUrl}/api/eve/pipeline-synthesize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: '{}',
        cache: 'no-store',
      });

      const pipeJson = (await readJson(pipeRes)) as Record<string, unknown> | null;

      if (!pipeRes.ok) {
        lastPipelineCycleTriggered = null;
        return;
      }

      if (pipeJson?.ok !== true) {
        lastPipelineCycleTriggered = null;
        return;
      }

      const published = (pipeJson as { published?: unknown }).published;
      if (published === false) {
        const reason = (pipeJson as { reason?: unknown }).reason;
        if (reason === 'already_synthesized_for_window') {
          return;
        }
      }
    } catch {
      lastPipelineCycleTriggered = null;
    }
  })();
}
