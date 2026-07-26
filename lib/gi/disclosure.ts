/** C-384 PR-2 — published vs pre-floor GI (Metric Humility disclosure). */

export const GI_FLOOR = 0.6;

export type GiIntegrityDisclosure = {
  global_integrity: number;
  /** Pre-floor computed value when known; null for legacy KV rows until refresh. */
  raw_integrity: number | null;
  /** True when `global_integrity` was raised to GI_FLOOR from a lower raw value. */
  gi_floored: boolean;
};

export function disclosureFromComputed(global_integrity: number, raw_integrity: number): GiIntegrityDisclosure {
  const gi_floored = raw_integrity < GI_FLOOR && global_integrity >= GI_FLOOR;
  return {
    global_integrity,
    raw_integrity,
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
