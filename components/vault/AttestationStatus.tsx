'use client';

/**
 * Vault attestation / .dat canonization status banner.
 * EPICON: C-357 | RESERVE_BLOCK_DAT_CANONIZATION
 */

import { useEffect, useState } from 'react';
import type { AttestationDisplayStatus } from '@/lib/dat/types';

interface AttestationStatusProps {
  erroredBlocks: number;
  sealedBlocks: number;
  liveAttested: number;
  substrateAttestationError?: string | null;
  substrateAttestationId?: string | null;
}

interface ManifestState {
  loading: boolean;
  total_blocks_anchored: number;
  total_dat_files: number;
  chain_tip_hash: string | null;
  error: string | null;
}

export function AttestationStatus({
  erroredBlocks,
  sealedBlocks,
  liveAttested,
  substrateAttestationError,
  substrateAttestationId,
}: AttestationStatusProps) {
  const [manifest, setManifest] = useState<ManifestState>({
    loading: true,
    total_blocks_anchored: 0,
    total_dat_files: 0,
    chain_tip_hash: null,
    error: null,
  });

  useEffect(() => {
    void fetch('/api/canon/reserve-blocks/manifest', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        setManifest({
          loading: false,
          total_blocks_anchored: j.total_blocks_anchored ?? 0,
          total_dat_files: j.total_dat_files ?? 0,
          chain_tip_hash: j.chain_tip_hash ?? null,
          error: null,
        });
      })
      .catch((e) => {
        setManifest({
          loading: false,
          total_blocks_anchored: 0,
          total_dat_files: 0,
          chain_tip_hash: null,
          error: String(e),
        });
      });
  }, []);

  const status = deriveStatus({
    loading: manifest.loading,
    blocksAnchored: manifest.total_blocks_anchored,
    erroredBlocks,
    sealedBlocks,
    liveAttested,
  });

  const cfg = STATUS_CONFIG[status];

  return (
    <div className="space-y-2">
      <div className={`rounded border px-2 py-1.5 ${cfg.className}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true">{cfg.icon}</span>
          <span className="font-medium">{cfg.label}</span>
          {substrateAttestationId && status === 'attested' && (
            <span className="text-[10px] opacity-80">· {substrateAttestationId}</span>
          )}
        </div>
        <div className="mt-0.5 text-[10px] opacity-90">{cfg.detail(manifest, erroredBlocks)}</div>
        {status === 'error' && substrateAttestationError && (
          <div className="mt-1 text-[10px] text-slate-400">{substrateAttestationError}</div>
        )}
      </div>

      {(status === 'canonized_via_dat' || status === 'partial_canonized_via_dat') &&
        manifest.total_blocks_anchored > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-400">
          <div>
            <span className="text-slate-500">.dat files</span>{' '}
            <span className="text-cyan-300">{manifest.total_dat_files}</span>
          </div>
          <div>
            <span className="text-slate-500">blocks anchored</span>{' '}
            <span className="text-cyan-300">{manifest.total_blocks_anchored}</span>
          </div>
          <div className="col-span-2">
            <span className="text-slate-500">chain tip</span>{' '}
            <code className="text-cyan-300/90">
              {manifest.chain_tip_hash?.slice(7, 23) ?? '—'}...
            </code>
          </div>
          <div className="col-span-2 text-slate-500">
            source: GitHub · Mobius-Substrate · canon/reserve-blocks/
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_CONFIG: Record<
  AttestationDisplayStatus,
  {
    icon: string;
    label: string;
    className: string;
    detail: (m: ManifestState, errored: number) => string;
  }
> = {
  attested: {
    icon: '✓',
    label: 'Substrate attested',
    className: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-300',
    detail: () => 'Live attestation via CPC /ledger/attest',
  },
  canonized_via_dat: {
    icon: '◈',
    label: 'Canonized via .dat',
    className: 'border-violet-500/30 bg-violet-500/5 text-violet-200',
    detail: (m) =>
      `${m.total_blocks_anchored} blocks hash-anchored to CPC · chain verified`,
  },
  partial_canonized_via_dat: {
    icon: '◈',
    label: 'Partial .dat canonization',
    className: 'border-amber-500/30 bg-amber-500/5 text-amber-200',
    detail: (m, errored) =>
      `${m.total_blocks_anchored} blocks anchored · ${errored} live attestation errors remain · run full C-357 migration`,
  },
  pending: {
    icon: '○',
    label: 'Pending attestation',
    className: 'border-slate-600/40 bg-slate-900/40 text-slate-400',
    detail: () => 'Blocks sealed but not yet attested or canonized',
  },
  error: {
    icon: '✗',
    label: 'Substrate attestation failed',
    className: 'border-rose-500/30 bg-rose-500/5 text-rose-300',
    detail: (_, errored) =>
      `${errored} blocks failed live attestation · run C-357 canonization to resolve`,
  },
  quarantined: {
    icon: '⚠',
    label: 'Quarantined',
    className: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
    detail: () => 'Blocks in audit queue — inspect Canon for cause',
  },
};

function deriveStatus(args: {
  loading: boolean;
  blocksAnchored: number;
  erroredBlocks: number;
  sealedBlocks: number;
  liveAttested: number;
}): AttestationDisplayStatus {
  const { loading, blocksAnchored, erroredBlocks, sealedBlocks, liveAttested } = args;

  if (loading) return 'pending';

  if (blocksAnchored >= sealedBlocks && sealedBlocks > 0) {
    return 'canonized_via_dat';
  }

  if (blocksAnchored > 0) {
    return 'partial_canonized_via_dat';
  }

  if (liveAttested >= sealedBlocks && erroredBlocks === 0) {
    return 'attested';
  }

  if (erroredBlocks > 0) {
    return 'error';
  }

  return 'pending';
}
