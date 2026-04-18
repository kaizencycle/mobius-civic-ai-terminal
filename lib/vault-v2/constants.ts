import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';

/** Units per sealed reserve parcel (Vault v2). */
export const VAULT_RESERVE_PARCEL_UNITS = 50;

/** Sentinel council size for attestation quorum UI. */
export const SENTINEL_ATTESTATION_COUNT = SENTINEL_AGENTS.length;

/** Pass votes required for attested quorum (ZEUS pass + ≥ this many passes total). */
export const VAULT_QUORUM_MIN_PASSES = 4;
