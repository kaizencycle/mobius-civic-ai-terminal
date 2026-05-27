import { chamberMeta } from '../layout';
import SentinelPageClient from './SentinelPageClient';
import { kvGetSafe } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = chamberMeta(
  'Sentinel',
  'Agent liveness monitor — heartbeat, confidence, journal cadence, and quorum attestation status.',
  'sentinel'
);

type ZeusDispute = { cycle: string; message: string; ts: number };
type EpiconEscalation = { failures: number; severity: 'warn' | 'error' | 'critical' | 'alert'; label: string; ts: number };

export default async function SentinelPage() {
  // OPT-8 + OPT-10 (C-321): fetch dispute and escalation state from KV on the
  // server so the page renders with current signal data on first load.
  const [zeusDispute, epiconEscalation] = await Promise.all([
    kvGetSafe<ZeusDispute>('zeus:dispute:latest'),
    kvGetSafe<EpiconEscalation>('watchdog:epicon:escalation'),
  ]);

  return (
    <SentinelPageClient
      zeusDispute={zeusDispute ?? null}
      epiconEscalation={epiconEscalation ?? null}
    />
  );
}
