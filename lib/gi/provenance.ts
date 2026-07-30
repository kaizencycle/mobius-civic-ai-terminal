/**
 * C-388: GI provenance — separate heuristic defaults from live measurements.
 * Internal branching may use GI_HEURISTIC_DEFAULT; journal text and KV heartbeat
 * must not present it as a measured reading.
 */

export const GI_HEURISTIC_DEFAULT = 0.74;

export const GI_UNAVAILABLE_LABEL = 'unavailable this cycle';

export type GiProvenance = {
  gi: number;
  giIsLive: boolean;
};

export function clampGiForHeuristics(n: number): number {
  if (!Number.isFinite(n)) return GI_HEURISTIC_DEFAULT;
  return Math.max(0, Math.min(1, n));
}

export function giLabel(gi: number, isLive: boolean): string {
  return isLive ? gi.toFixed(2) : GI_UNAVAILABLE_LABEL;
}

export function parseGiField(giRaw: unknown): GiProvenance {
  const giIsLive = typeof giRaw === 'number' && Number.isFinite(giRaw);
  return {
    gi: giIsLive ? giRaw : GI_HEURISTIC_DEFAULT,
    giIsLive,
  };
}

export function parseOptionalGiField(giRaw: unknown): GiProvenance {
  if (giRaw === null || giRaw === undefined) {
    return { gi: GI_HEURISTIC_DEFAULT, giIsLive: false };
  }
  return parseGiField(giRaw);
}

export function resolveGiProvenanceFromBody(body: Record<string, unknown>): GiProvenance {
  const fromGi = parseGiField(body.gi);
  if (typeof body.giIsLive === 'boolean') {
    // Explicit flag may downgrade a numeric GI but cannot upgrade a missing/non-finite value.
    return { gi: fromGi.gi, giIsLive: fromGi.giIsLive && body.giIsLive };
  }
  return fromGi;
}
