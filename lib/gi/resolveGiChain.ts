/**
 * C-287 — Verified Memory Mode: GI read chain (no estimation; real recorded tiers only).
 * Order: KV live → live compute → KV carry → OAA bridge → MIC readiness snapshot → unknown.
 * C-322: a fresh `GIState` row with `source: 'cached'` is GitHub federation, not KV live — surfaced as `github-state-mirror`.
 */

import type { GIMode } from '@/lib/gi/mode';
import { getGiMode } from '@/lib/gi/mode';
import { disclosureFromStored } from '@/lib/gi/disclosure';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { loadGIState, loadGIStateCarry, type GIState } from '@/lib/kv/store';
import { kvBridgeConfigured, kvBridgeRead } from '@/lib/kv/kvBridgeClient';

/** Operator-facing GI provenance (C-287). */
export type GISourceDisplay =
  | 'kv-live'
  | 'live-compute'
  | 'kv-carry'
  | 'github-state-mirror'
  | 'oaa-verified'
  | 'readiness-fallback'
  | 'unknown';

const KV_LIVE_MAX_AGE_MS = 10 * 60 * 1000;

export type GiChainResolution = {
  gi: number | null;
  mode: GIMode | string | null;
  terminal_status: string | null;
  primary_driver: string | null;
  /** C-287 display tier */
  source: GISourceDisplay;
  /** Legacy bucket for snapshot-lite / APIs */
  source_legacy:
    | 'kv'
    | 'kv_carry_forward'
    | 'live_compute'
    | 'readiness_snapshot'
    | 'github_state_mirror'
    | 'null';
  timestamp: string | null;
  age_seconds: number | null;
  /** OAA bridge row includes server `written_at`; we treat bridge-backed GI as verified for UI. */
  verified: boolean;
  degraded: boolean;
  raw_integrity: number | null;
  gi_floored: boolean;
  kv?: GIState | null;
};

function ageSeconds(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 1000));
}

function modeFromGi(gi: number): GIMode {
  return getGiMode(gi);
}

function parseMicReadinessSnapshotGi(raw: unknown): { gi: number; updatedAt: string | null } | null {
  if (raw === null || raw === undefined) return null;
  let o: Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof raw === 'object') {
    o = raw as Record<string, unknown>;
  } else {
    return null;
  }
  const nested = o.snapshot && typeof o.snapshot === 'object' ? (o.snapshot as Record<string, unknown>) : o;
  const g = nested.gi;
  if (typeof g !== 'number' || !Number.isFinite(g)) return null;
  const updatedAt =
    typeof nested.updatedAt === 'string'
      ? nested.updatedAt
      : typeof o.updatedAt === 'string'
        ? o.updatedAt
        : typeof o.received_at === 'string'
          ? o.received_at
          : null;
  return { gi: Math.max(0, Math.min(1, g)), updatedAt };
}

function parseGiStateValue(value: unknown): GIState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const gi = v.global_integrity;
  if (typeof gi !== 'number' || !Number.isFinite(gi)) return null;
  return value as GIState;
}

const GI_ROW_MATCH_EPS = 0.001;

function disclosureForRow(
  selectedGi: number,
  row: GIState | null | undefined,
): { raw_integrity: number | null; gi_floored: boolean } {
  if (!row) return { raw_integrity: null, gi_floored: false };
  if (Math.abs(row.global_integrity - selectedGi) > GI_ROW_MATCH_EPS) {
    return { raw_integrity: null, gi_floored: false };
  }
  return disclosureFromStored(row);
}

const NO_DISCLOSURE = { raw_integrity: null, gi_floored: false } as const;

function finish(
  partial: Omit<GiChainResolution, 'raw_integrity' | 'gi_floored'>,
  disc: { raw_integrity: number | null; gi_floored: boolean },
): GiChainResolution {
  return { ...partial, ...disc };
}

export async function resolveGiChain(opts?: {
  micReadinessSnapshotRaw?: string | null;
  /** When provided (e.g. snapshot-lite MGET), avoids duplicate KV GETs for GI rows. */
  preloadedGi?: { primary: GIState | null; carry: GIState | null };
}): Promise<GiChainResolution> {
  const st = opts?.preloadedGi?.primary ?? (await loadGIState());
  if (st && typeof st.global_integrity === 'number' && Number.isFinite(st.global_integrity)) {
    const ageMs = Date.now() - new Date(st.timestamp).getTime();
    const maxAgeMs =
      st.gi_write_source === 'micro_sweep' ? 2 * 60 * 1000 : KV_LIVE_MAX_AGE_MS;
    if (ageMs < maxAgeMs) {
      const gi = Math.max(0, Math.min(1, st.global_integrity));
      // C-322: `loadGIState` may return GitHub `STATE/gi/latest.json` with `source: 'cached'`.
      // That is not live KV authority — do not emit kv-live / degraded:false.
      if (st.source === 'cached') {
        return finish(
          {
            gi,
            mode: st.mode ?? null,
            terminal_status: st.terminal_status ?? null,
            primary_driver:
              st.primary_driver && st.primary_driver.length > 0
                ? `${st.primary_driver} · GitHub STATE cold tier (KV miss or outage; not live authority)`
                : 'GI from GitHub STATE/gi/latest.json (federated read; not live KV)',
            source: 'github-state-mirror',
            source_legacy: 'github_state_mirror',
            timestamp: st.timestamp,
            age_seconds: ageSeconds(st.timestamp),
            verified: false,
            degraded: true,
            kv: st,
          },
          disclosureForRow(gi, st),
        );
      }
      return finish(
        {
          gi,
          mode: st.mode ?? null,
          terminal_status: st.terminal_status ?? null,
          primary_driver: st.primary_driver ?? null,
          source: 'kv-live',
          source_legacy: 'kv',
          timestamp: st.timestamp,
          age_seconds: ageSeconds(st.timestamp),
          verified: false,
          degraded: false,
          kv: st,
        },
        disclosureForRow(gi, st),
      );
    }
  }

  try {
    const live = await computeIntegrityPayload();
    return finish(
      {
        gi: live.global_integrity,
        mode: live.mode,
        terminal_status: live.terminal_status,
        primary_driver: live.primary_driver,
        source: 'live-compute',
        source_legacy: 'live_compute',
        timestamp: live.timestamp,
        age_seconds: ageSeconds(live.timestamp),
        verified: false,
        degraded: false,
        kv: st,
      },
      typeof live.raw_integrity === 'number'
        ? { raw_integrity: live.raw_integrity, gi_floored: live.gi_floored }
        : NO_DISCLOSURE,
    );
  } catch {
    // continue
  }

  const carry = opts?.preloadedGi?.carry ?? (await loadGIStateCarry());
  if (carry && typeof carry.global_integrity === 'number' && Number.isFinite(carry.global_integrity)) {
    const gi = Math.max(0, Math.min(1, carry.global_integrity));
    return finish(
      {
        gi,
        mode: carry.mode ?? null,
        terminal_status: carry.terminal_status ?? null,
        primary_driver: `${carry.primary_driver ?? 'GI'} (carried forward; primary gi:latest missing or stale)`,
        source: 'kv-carry',
        source_legacy: 'kv_carry_forward',
        timestamp: carry.timestamp,
        age_seconds: ageSeconds(carry.timestamp),
        verified: false,
        degraded: true,
        kv: st,
      },
      disclosureForRow(gi, carry),
    );
  }

  if (kvBridgeConfigured()) {
    try {
      const row = await kvBridgeRead('GI_STATE');
      if (row?.ok && row.value != null) {
        const parsed = parseGiStateValue(row.value);
        if (parsed && typeof parsed.global_integrity === 'number') {
          const gi = Math.max(0, Math.min(1, parsed.global_integrity));
          const ts = parsed.timestamp ?? row.written_at ?? null;
          return finish(
            {
              gi,
              mode: parsed.mode ?? modeFromGi(gi),
              terminal_status: parsed.terminal_status ?? null,
              primary_driver: parsed.primary_driver ?? 'GI from OAA KV bridge (last recorded)',
              source: 'oaa-verified',
              source_legacy: 'kv',
              timestamp: ts,
              age_seconds: ts ? ageSeconds(ts) : ageSeconds(row.written_at),
              verified: true,
              degraded: true,
              kv: st,
            },
            disclosureForRow(gi, parsed),
          );
        }
      }
    } catch {
      // fall through
    }
  }

  const snap =
    opts?.micReadinessSnapshotRaw != null ? parseMicReadinessSnapshotGi(opts.micReadinessSnapshotRaw) : null;
  if (snap) {
    const gi = snap.gi;
    const ts = snap.updatedAt ?? new Date().toISOString();
    return finish(
      {
        gi,
        mode: modeFromGi(gi),
        terminal_status: null,
        primary_driver: 'GI from MIC_READINESS_SNAPSHOT (readiness cache)',
        source: 'readiness-fallback',
        source_legacy: 'readiness_snapshot',
        timestamp: ts,
        age_seconds: ageSeconds(snap.updatedAt),
        verified: false,
        degraded: true,
        kv: st,
      },
      NO_DISCLOSURE,
    );
  }

  return finish(
    {
      gi: null,
      mode: null,
      terminal_status: null,
      primary_driver: null,
      source: 'unknown',
      source_legacy: 'null',
      timestamp: null,
      age_seconds: null,
      verified: false,
      degraded: true,
      kv: st,
    },
    NO_DISCLOSURE,
  );
}
