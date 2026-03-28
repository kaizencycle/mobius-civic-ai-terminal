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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const secret = process.env.BACKFILL_SECRET;
  if (!apiKey?.trim() || !secret?.trim()) {
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

      const pipeRes = await fetch(`${baseUrl}/api/eve/cycle-synthesize`, {
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
        console.error(
          'EVE observation pipeline HTTP error',
          pipeRes.status,
          pipeJson !== null && typeof pipeJson === 'object' ? JSON.stringify(pipeJson) : 'empty body',
        );
        return;
      }

      if (pipeJson?.ok !== true) {
        lastPipelineCycleTriggered = null;
        console.error('EVE observation pipeline rejected', JSON.stringify(pipeJson));
      }
    } catch (err) {
      lastPipelineCycleTriggered = null;
      console.error('EVE observation pipeline trigger failed', err);
    }
  })();
}
