/** C-384 PR-2 — published vs pre-floor GI (Metric Humility disclosure). */

export const GI_FLOOR = 0.6;

export type GiIntegrityDisclosure = {
  global_integrity: number;
  /** Pre-floor computed value when known; null for legacy KV rows until refresh. */
  raw_integrity: number | null;
  /** True when `global_integrity` was raised to GI_FLOOR from a lower raw value. */
  gi_floored: boolean;
};

export function disclosureFromComputed(publishedGlobal: number, rawIntegrity: number): GiIntegrityDisclosure {
  const published = Number(publishedGlobal.toFixed(2));
  const raw = Number(rawIntegrity.toFixed(2));
  // Floor check uses unrounded raw so 0.595–0.599 still flags gi_floored when published is 0.60.
  const gi_floored = rawIntegrity < GI_FLOOR && publishedGlobal >= GI_FLOOR - 1e-9;
  return {
    global_integrity: published,
    raw_integrity: raw,
    gi_floored,
  };
}

export function disclosureFromStored(state: {
  global_integrity: number;
  raw_integrity?: number | null;
  gi_floored?: boolean;
}): GiIntegrityDisclosure {
  if (typeof state.raw_integrity === 'number' && Number.isFinite(state.raw_integrity)) {
    return {
      global_integrity: state.global_integrity,
      raw_integrity: state.raw_integrity,
      gi_floored:
        typeof state.gi_floored === 'boolean'
          ? state.gi_floored
          : state.raw_integrity < GI_FLOOR && state.global_integrity >= GI_FLOOR,
    };
  }
  return {
    global_integrity: state.global_integrity,
    raw_integrity: null,
    gi_floored: false,
  };
}
