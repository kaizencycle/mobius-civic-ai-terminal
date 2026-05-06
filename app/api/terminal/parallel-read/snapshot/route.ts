import { NextRequest, NextResponse } from 'next/server';
import { GET as getLegacySnapshot } from '@/app/api/terminal/snapshot/route';
import { buildTerminalDalSnapshot } from '@/lib/dal/snapshot';

export const dynamic = 'force-dynamic';

type ParallelReadStatus = 'matched' | 'mismatch' | 'legacy_only' | 'dal_degraded';

type SnapshotParity = {
  cycle_match: boolean;
  degraded_match: boolean;
  vault_ok_match: boolean;
  timestamp_present: boolean;
};

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getLegacyVaultOk(legacy: Record<string, unknown>): boolean | null {
  const vaultLeaf = safeRecord(legacy.vault);
  if (typeof vaultLeaf.ok === 'boolean') return vaultLeaf.ok;

  const vaultData = safeRecord(vaultLeaf.data);
  if (typeof vaultData.ok === 'boolean') return vaultData.ok;

  return null;
}

function getStatus(parity: SnapshotParity, dalOk: boolean): ParallelReadStatus {
  if (!dalOk) return 'dal_degraded';
  const values = Object.values(parity);
  if (values.every(Boolean)) return 'matched';
  if (values.every((value) => value === false)) return 'legacy_only';
  return 'mismatch';
}

/**
 * C-303 Phase 2C — Snapshot parallel read route.
 *
 * This is not a cutover. /api/terminal/snapshot remains authoritative.
 * The DAL snapshot is returned beside it so operators and agents can observe parity.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const baseUrl = request.nextUrl.origin;
  const cycle = request.nextUrl.searchParams.get('cycle')?.trim();
  const legacyRequestUrl = new URL('/api/terminal/snapshot', baseUrl);
  if (cycle) legacyRequestUrl.searchParams.set('cycle', cycle);

  const legacyRequest = new NextRequest(legacyRequestUrl);
  const legacyResponse = await getLegacySnapshot(legacyRequest);
  const legacyPayload = await legacyResponse.json().catch(() => null);
  const legacy = safeRecord(legacyPayload);
  const legacyCycle = typeof legacy.cycle === 'string' ? legacy.cycle : cycle ?? 'C-303';
  const legacyVaultOk = getLegacyVaultOk(legacy);

  const dalResult = await buildTerminalDalSnapshot(legacyCycle);
  const dal = dalResult.data ?? null;

  const parity: SnapshotParity = {
    cycle_match: dal ? legacyCycle === dal.cycle : false,
    degraded_match: dal ? Boolean(legacy.degraded) === dal.degraded : false,
    vault_ok_match: dal && legacyVaultOk !== null ? legacyVaultOk === dal.vault.ok : false,
    timestamp_present: Boolean(legacy.timestamp) && Boolean(dal?.generated_at),
  };

  const status = getStatus(parity, dalResult.ok);

  return NextResponse.json(
    {
      ok: legacyResponse.ok && status !== 'mismatch' && status !== 'dal_degraded',
      mode: 'parallel_read_snapshot',
      phase: 'C-303 Phase 2C',
      authority: {
        authoritative_source: 'legacy_snapshot_runtime',
        dal_authority: 'shadow_only',
        cutover_enabled: false,
      },
      status,
      legacy: {
        ok: legacy.ok ?? legacyResponse.ok,
        cycle: legacyCycle,
        gi: typeof legacy.gi === 'number' ? legacy.gi : null,
        effective_gi: typeof legacy.effective_gi === 'number' ? legacy.effective_gi : null,
        degraded: typeof legacy.degraded === 'boolean' ? legacy.degraded : null,
        terminal_status: typeof legacy.terminal_status === 'string' ? legacy.terminal_status : null,
        vault_ok: legacyVaultOk,
        timestamp: typeof legacy.timestamp === 'string' ? legacy.timestamp : null,
        lanes_count: Array.isArray(legacy.lanes) ? legacy.lanes.length : null,
      },
      dal: {
        ok: dalResult.ok,
        degraded: dalResult.degraded ?? !dalResult.ok,
        cycle: dal?.cycle ?? null,
        snapshot_degraded: dal?.degraded ?? null,
        vault_ok: dal?.vault.ok ?? null,
        vault_headline: dal?.vault.headline ?? null,
        generated_at: dal?.generated_at ?? null,
        provenance: dalResult.provenance,
        error: dalResult.error ?? null,
      },
      parity,
      meta: {
        elapsed_ms: Date.now() - startedAt,
        canonical_warning: 'Parallel read only. /api/terminal/snapshot remains authoritative.',
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Mobius-Source': 'terminal-parallel-read-snapshot',
      },
    },
  );
}
