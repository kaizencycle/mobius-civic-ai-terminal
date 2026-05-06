import { chamberMeta } from '../layout';
import VaultPageClient from './VaultPageClient';

export const revalidate = 60;

export const metadata = chamberMeta(
  'Vault',
  'MIC reserve blocks, fountain gate, substrate attestation, and seal quarantine status.',
  'vault'
);

export default function VaultPage() {
  return <VaultPageClient />;
}
