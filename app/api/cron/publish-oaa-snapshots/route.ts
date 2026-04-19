/**
 * GET/POST /api/cron/publish-oaa-snapshots
 *
 * Dual-write (WRITE_MODE=dual): append MIC readiness + vault status to OAA,
 * then forward OAA_MEMORY_ENTRY_V1 proof to Civic Core when configured.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getEveSynthesisAuthError } from '@/lib/security/serviceAuth';
import {
  publishMicReadinessFromTerminal,
  publishVaultStatusFromTerminal,
} from '@/lib/oaa/publishSnapshot';
import { isOaaPublishEnabled } from '@/lib/mesh/loadMobiusYaml';

export const dynamic = 'force-dynamic';

async function run() {
  if (!isOaaPublishEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'WRITE_MODE not dual or OAA URL/HMAC missing — see .env.example and mobius.yaml ingest.sovereign_memory',
    });
  }

  const [mic, vault] = await Promise.all([publishMicReadinessFromTerminal(), publishVaultStatusFromTerminal()]);

  return NextResponse.json({
    ok: true,
    mic_readiness: mic,
    vault_status: vault,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  const authErr = getEveSynthesisAuthError(request);
  if (authErr) return authErr;
  return run();
}

export async function POST(request: NextRequest) {
  const authErr = getEveSynthesisAuthError(request);
  if (authErr) return authErr;
  return run();
}
