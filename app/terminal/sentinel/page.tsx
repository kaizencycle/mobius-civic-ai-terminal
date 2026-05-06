import { chamberMeta } from '../layout';
import SentinelPageClient from './SentinelPageClient';

export const metadata = chamberMeta(
  'Sentinel',
  'Agent liveness monitor — heartbeat, confidence, journal cadence, and quorum attestation status.',
  'sentinel'
);

export default function SentinelPage() {
  return <SentinelPageClient />;
}
