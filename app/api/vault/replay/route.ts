import { NextResponse } from 'next/server';
import { listAllSeals } from '@/lib/vault-v2/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const seals = await listAllSeals(50);

    const sorted = [...seals].sort(
      (a, b) => new Date(b.sealed_at).getTime() - new Date(a.sealed_at).getTime(),
    );

    return NextResponse.json({
      ok: true,
      count: sorted.length,
      seals: sorted.map((s) => ({
        seal_id: s.seal_id,
        sequence: s.sequence,
        status: s.status,
        sealed_at: s.sealed_at,
        cycle_at_seal: s.cycle_at_seal,
        gi_at_seal: s.gi_at_seal,
        seal_hash: s.seal_hash,
        prev_seal_hash: s.prev_seal_hash ?? null,
        substrate_attested: Boolean(s.substrate_attestation_id),
        fountain_status: s.fountain_status,
        attestation_count: Object.keys(s.attestations).length,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'vault_replay_index_failed' },
      { status: 500 },
    );
  }
}
