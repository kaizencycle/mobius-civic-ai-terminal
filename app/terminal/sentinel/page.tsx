import { chamberMeta } from '../layout';
import SentinelPageClient from './SentinelPageClient';
import { kvGet } from '@/lib/kv/store';

export const metadata = chamberMeta(
  'Sentinel',
  'Agent liveness monitor — heartbeat, confidence, journal cadence, and quorum attestation status.',
  'sentinel'
);

type ZeusDispute = { cycle: string; message: string; ts: number };
type EpiconEscalation = { failures: number; severity: string; label: string; ts: number };

export default async function SentinelPage() {
  // OPT-8 + OPT-10 (C-321): fetch dispute and escalation state from KV on the
  // server so the page renders with current signal data on first load.
  const [zeusDispute, epiconEscalation] = await Promise.all([
    kvGet<ZeusDispute>('zeus:dispute:latest').catch(() => null),
    kvGet<EpiconEscalation>('watchdog:epicon:escalation').catch(() => null),
  ]);

  return (
    <SentinelPageClient
      zeusDispute={zeusDispute ?? null}
      epiconEscalation={epiconEscalation ?? null}
    />
  );
}
